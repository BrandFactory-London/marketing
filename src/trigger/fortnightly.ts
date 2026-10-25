import { schedules } from "@trigger.dev/sdk";
import { getDb } from "@/db/client";
import { dueRuns, stalledBatches, startFortnight } from "@/lib/batch-generation";
import { londonToday } from "@/lib/dates";
import { batchRoundTask } from "./batch-round";

// Every morning at 06:00 UK time (orientation Q7): each active run whose generation day has come gets its batch, and
// the batch-round task takes it from there. A missed morning catches up on the next one.
export const fortnightlyTask = schedules.task({
  id: "fortnightly",
  cron: { pattern: "0 6 * * *", timezone: "Europe/London" },
  run: async () => {
    const db = getDb();
    const today = londonToday();
    const started: { runId: string; batchId: string; posts: number }[] = [];
    for (const run of await dueRuns(today, db)) {
      const { batchId, posts } = await startFortnight(run.id, today, db);
      if (!batchId) continue;
      await batchRoundTask.trigger({ batchId }, { idempotencyKey: `batch-round-${batchId}`, tags: [`batch_${batchId}`] });
      started.push({ runId: run.id, batchId, posts });
    }
    // A batch whose run never started, or stopped, starts again, under a key for today.
    const resumed = await stalledBatches(db);
    for (const batchId of resumed) await batchRoundTask.trigger({ batchId }, { idempotencyKey: `batch-round-${batchId}-${today}`, tags: [`batch_${batchId}`] });
    return { today, started, resumed };
  },
});
