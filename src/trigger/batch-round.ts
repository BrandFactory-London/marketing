import { task, wait } from "@trigger.dev/sdk";
import { getDb } from "@/db/client";
import { anthropicBatchTransport } from "@/lib/ai/batch";
import { openRound, pollRound, POLL_MINUTES, submitRound } from "@/lib/batch-generation";

export type BatchRoundPayload = { batchId: string };

// A fortnight's generation (Phase 2 A4, orientation Q7): round after round, each one message batch at half price, until
// every post has reached Needs review or Failed. Waiting is checkpointed by Trigger.dev, so it costs no compute; a
// retried run picks up the round already with Anthropic instead of submitting it again.
export const batchRoundTask = task({
  id: "batch-round",
  // Compute time only; the waits between looks do not count.
  maxDuration: 60 * 60,
  run: async (payload: BatchRoundPayload) => {
    const deps = { db: getDb(), batch: anthropicBatchTransport() };
    let rounds = 0;
    // Seven rounds at most per post (spec, then up to three writer and critic pairs), and one retry each.
    for (let guard = 0; guard < 16; guard++) {
      const round = (await openRound(payload.batchId, deps.db)) ?? (await submitRound(payload.batchId, deps));
      if (!round) return { rounds };
      rounds++;
      while ((await pollRound(round.id, deps)) === "waiting") await wait.for({ minutes: POLL_MINUTES });
    }
    return { rounds };
  },
});
