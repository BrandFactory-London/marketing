import "server-only";
import { desc, inArray } from "drizzle-orm";
import { getDb, type Database } from "@/db/client";
import { postDrafts } from "@/db/schema";
import { modelLabel } from "@/config/models";
import { getBatch, listBatchPosts } from "./batches";
import { longDate } from "./dates";
import { formatCost } from "./format";
import { getProject } from "./projects";
import { progressLine, progressPercent, type ProgressLine } from "./progress";

// The Generating screen's data, also served as JSON for its 3-second poll (γ4 orientation Q6).

export type ProgressRow = ProgressLine & { generationStatus: string; postId: string; topic: string; date: string; cost: string; round: number; draftHref: string | null; words: number | null };

export type BatchProgress = {
  batchId: string;
  batchName: string;
  projectId: string;
  projectName: string;
  models: string;
  rows: ProgressRow[];
  total: number;
  finished: number;
  inReview: number;
  needsAttention: number;
  percent: number;
  done: boolean;
  cost: string;
};

export async function getBatchProgress(batchId: string, db: Database = getDb(), now: Date = new Date()): Promise<BatchProgress | null> {
  const batch = await getBatch(batchId, db);
  if (!batch) return null;
  const [project, posts] = await Promise.all([getProject(batch.projectId, db), listBatchPosts(batch.id, db)]);
  const generationIds = posts.flatMap((post) => (post.generation ? [post.generation.id] : []));
  const drafts = generationIds.length
    ? await db
        .select({ generationId: postDrafts.generationId, wordCount: postDrafts.wordCount, round: postDrafts.round })
        .from(postDrafts)
        .where(inArray(postDrafts.generationId, generationIds))
        .orderBy(desc(postDrafts.round))
    : [];

  const rows: ProgressRow[] = posts
    .filter((post) => post.generation)
    .map((post) => {
      const line = progressLine({ status: post.status, generationStep: post.generationStep, generation: post.generation }, now);
      const draft = drafts.find((item) => item.generationId === post.generation!.id);
      return {
        ...line,
        generationStatus: post.generation!.status,
        postId: post.id,
        topic: post.topic ?? "",
        date: longDate(post.slotDate),
        cost: formatCost(post.costUsd),
        round: post.generation!.round,
        draftHref: draft ? `/posts/${post.id}` : null,
        words: draft?.wordCount ?? null,
      };
    });
  const finished = rows.filter((row) => row.finished).length;
  return {
    batchId: batch.id,
    batchName: batch.name,
    projectId: batch.projectId,
    projectName: project?.name ?? "",
    models: `Writer ${modelLabel(batch.writerModel)}, critic ${modelLabel(batch.criticModel)}`,
    rows,
    total: rows.length,
    finished,
    // Passed or flagged: both wait in the review queue.
    inReview: rows.filter((row) => row.generationStatus === "in_review" || row.generationStatus === "flagged").length,
    needsAttention: rows.filter((row) => row.canRetry).length,
    percent: progressPercent(rows),
    done: rows.length > 0 && finished === rows.length,
    cost: formatCost(posts.reduce((sum, post) => sum + post.costUsd, 0)),
  };
}
