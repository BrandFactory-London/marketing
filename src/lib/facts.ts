import { and, desc, eq } from "drizzle-orm";
import { getDb, type Database } from "@/db/client";
import { posts, reviewEvents, ruleCandidates } from "@/db/schema";
import * as factsPrompt from "@/prompts/facts";
import { AiClient, type Transport } from "./ai/client";
import { loadPack } from "./ai/pack";
import { candidateKey, pendingCandidateKeys } from "./candidate-keys";
import { getModelSettings } from "./settings";

// Fact suggestions from regenerate notes (γ6 orientation Q7). They are rule candidates of kind "fact", triaged in
// Settings with the rest.

export const FACTS_EFFORT = "low" as const;
export const FACTS_MAX_TOKENS = 4000;

export type FactsDeps = { db: Database; transport: Transport };

// The regenerate event just recorded for a post, so its note can be read for facts.
export async function latestRegenerateEvent(postId: string, db: Database = getDb()): Promise<string | null> {
  const [row] = await db
    .select({ id: reviewEvents.id })
    .from(reviewEvents)
    .where(and(eq(reviewEvents.postId, postId), eq(reviewEvents.action, "regenerate")))
    .orderBy(desc(reviewEvents.createdAt))
    .limit(1);
  return row?.id ?? null;
}

// Runs in the propose-facts task. Does nothing when the note has been read already, so a retried run never pays twice.
export async function proposeFacts(reviewEventId: string, deps: FactsDeps): Promise<number> {
  const { db } = deps;
  const [event] = await db.select().from(reviewEvents).where(eq(reviewEvents.id, reviewEventId));
  if (!event || event.action !== "regenerate" || !event.note?.trim()) return 0;
  const [existing] = await db.select({ id: ruleCandidates.id }).from(ruleCandidates).where(eq(ruleCandidates.reviewEventId, reviewEventId)).limit(1);
  if (existing) return 0;
  const [post] = await db.select().from(posts).where(eq(posts.id, event.postId));
  if (!post) return 0;
  const pack = await loadPack(post.projectId, db);
  const { writerModel } = await getModelSettings(db);
  const { value, call } = await new AiClient(db, deps.transport).parsed(
    {
      purpose: "facts",
      model: writerModel,
      promptVersion: factsPrompt.PROMPT_VERSION,
      effort: FACTS_EFFORT,
      maxTokens: FACTS_MAX_TOKENS,
      pack: pack.text,
      instructions: factsPrompt.INSTRUCTIONS,
      user: factsPrompt.factsUserMessage({ title: post.topic ?? "Untitled", note: event.note }),
      batchId: post.batchId,
      postId: post.id,
    },
    factsPrompt.FactsReply,
  );
  const pending = await pendingCandidateKeys(db);
  const rows = [];
  for (const fact of value.facts.slice(0, factsPrompt.MAX_FACTS)) {
    const text = fact.text.replace(/\s+/g, " ").trim();
    if (!text) continue;
    const section = factsPrompt.FACT_TARGETS[fact.tier];
    const key = await candidateKey(db, post.id, fact.tier, section, text);
    if (pending.has(key)) continue;
    pending.add(key);
    rows.push({ reviewEventId, postId: post.id, kind: "fact" as const, tier: fact.tier, section, text, before: null, after: fact.quote || null, reason: fact.reason || null, aiCallId: call.id });
  }
  if (rows.length > 0) await db.insert(ruleCandidates).values(rows);
  return rows.length;
}
