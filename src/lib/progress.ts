import { GENERATION_LINES, GENERATION_STEPS, getPostStatus, postStatusLabel, type GenerationStep, type PostStatus } from "@/config/post-status";
import type { GenerationStatus } from "@/db/schema";
import type { BadgeTone } from "@/components/ui/Badge";
import { MAX_ROUNDS } from "./generation-limits";

// What the Generating screen shows for each post (γ4 orientation Q6). Needs another pass, Could not finish,
// Queued and Stopped reporting are display lines beside the post's real status, not statuses.

// A run with no saved progress for this long has stopped (Q6: 20 minutes per post run).
export const STALL_MS = 20 * 60 * 1000;

export type ProgressInput = {
  status: PostStatus;
  generationStep: GenerationStep | null;
  generation: { status: GenerationStatus; round: number; error: string | null; updatedAt: Date | string } | null;
};

export type ProgressLine = { label: string; tone: BadgeTone; detail: string; finished: boolean; canRetry: boolean; running: boolean };

export function progressLine(post: ProgressInput, now: Date = new Date()): ProgressLine {
  const generation = post.generation;
  const status = getPostStatus(post.status);
  if (!generation) return { label: status.label, tone: status.tone, detail: "Not started", finished: false, canRetry: false, running: false };
  const round = Math.max(generation.round, 1);
  switch (generation.status) {
    case "queued":
      return { ...GENERATION_LINES.queued, detail: "Waiting for a worker", finished: false, canRetry: false, running: true };
    case "running": {
      if (now.getTime() - new Date(generation.updatedAt).getTime() > STALL_MS) {
        return { ...GENERATION_LINES.stalled, detail: "This post stopped reporting progress. Retry it.", finished: true, canRetry: true, running: false };
      }
      const step = GENERATION_STEPS[post.generationStep ?? "writer"];
      if (round >= 2) return { ...GENERATION_LINES.anotherPass, detail: `Round ${round} of ${MAX_ROUNDS}, ${step.toLowerCase()}`, finished: false, canRetry: false, running: true };
      return { label: postStatusLabel("generating", post.generationStep ?? "writer"), tone: "brand", detail: `Round 1 of ${MAX_ROUNDS}`, finished: false, canRetry: false, running: true };
    }
    case "in_review": {
      const line = getPostStatus("in_review");
      return { label: line.label, tone: line.tone, detail: round === 1 ? "Passed the critic first time" : `Passed the critic in round ${round}`, finished: true, canRetry: false, running: false };
    }
    case "flagged": {
      const line = getPostStatus("flagged");
      return { label: line.label, tone: line.tone, detail: "The critic still failed it after two fix rounds. It is in your review queue.", finished: true, canRetry: false, running: false };
    }
    case "failed":
      return { ...GENERATION_LINES.couldNotFinish, detail: generation.error ?? "The run stopped.", finished: true, canRetry: true, running: false };
  }
}

// Finished posts count whole; a running post counts by its round.
export function progressPercent(lines: readonly (ProgressLine & { round: number })[]): number {
  if (lines.length === 0) return 0;
  const done = lines.reduce((sum, line) => sum + (line.finished ? 1 : line.running ? Math.min(line.round, MAX_ROUNDS) / (MAX_ROUNDS + 1) : 0), 0);
  return Math.round((done / lines.length) * 100);
}
