// The real runs: the batch and review flows' server actions, without the signed-in UI, against the database in
// DATABASE_URL. Specs, posts and rule candidates are written by `trigger.dev dev` workers with the real
// Anthropic API.
//
//   DATABASE_URL=<Neon dev> npx tsx --conditions=react-server scripts/real-run.ts start
//   ... scripts/real-run.ts generate <batchId>
//   ... scripts/real-run.ts report <batchId>
//   ... scripts/real-run.ts regenerate <postId> "<note>"     (γ5: Regenerate with a note)
//   ... scripts/real-run.ts approve <postId>                  (γ5: removes placeholder sentences, approves, proposes rules)
//   ... scripts/real-run.ts post-report <postId>
//
// It talks to Neon over the WebSocket driver, as scripts/migrate-lib.ts does (port 5432 is blocked from
// Claude's cloud environment), and refuses any database but Neon dev.
import { devPool, getDb } from "./dev-db-client";
import { confirmAllSpecs, createBatch, DEFAULT_LENGTH, defaultCta, listBatchableSlots, queueGenerations } from "@/lib/batches";
import { findPlaceholders } from "@/lib/checks";
import { startGeneration, startRuleCandidates, startSpec } from "@/lib/jobs";
import { approvePost, currentText, queueRegeneration } from "@/lib/review";
import { getCurrentKnowledge } from "@/lib/knowledge";
import { getModelSettings } from "@/lib/settings";
import { setTopic } from "@/lib/slots";

const DEV_ENDPOINT = "ep-square-mode-zatw6e39";
const MIGSS_PROJECT = "e82463ed-89c7-402b-bc14-2e1b44c82fa6";
// The second Migss post: the model test's cost topic, on the next empty slot.
const SECOND_TOPIC = "How much does a bathroom renovation cost in Essex?";

const host = new URL(process.env.DATABASE_URL ?? "postgres://none").hostname;
if (!host.startsWith(DEV_ENDPOINT)) throw new Error(`Refusing ${host}: the real run is for Neon dev only.`);
const db = getDb();

async function start() {
  let slots = await listBatchableSlots(MIGSS_PROJECT, db);
  if (slots.length < 2) {
    const empty = await db.query.posts.findFirst({
      where: (post, { and, eq, isNull }) => and(eq(post.projectId, MIGSS_PROJECT), eq(post.status, "planned"), isNull(post.batchId)),
      orderBy: (post, { asc }) => asc(post.slotDate),
    });
    if (!empty) throw new Error("No empty Migss slot to give the second topic.");
    await setTopic(empty.id, SECOND_TOPIC, db);
    slots = await listBatchableSlots(MIGSS_PROJECT, db);
  }
  const chosen = slots.slice(0, 2);
  const knowledge = await getCurrentKnowledge({ tier: "project", projectId: MIGSS_PROJECT }, db);
  const models = await getModelSettings(db);
  const { batch, specIds } = await createBatch(
    MIGSS_PROJECT,
    {
      name: "γ4 real run",
      lengthMin: DEFAULT_LENGTH.min,
      lengthMax: DEFAULT_LENGTH.max,
      cta: defaultCta(knowledge?.sections.cta),
      faqMode: "useful",
      defaultPillarId: null,
      notes: null,
      writerModel: models.writerModel,
      criticModel: models.criticModel,
      posts: chosen.map((slot) => ({ id: slot.id, pillarId: null, note: null })),
    },
    db,
  );
  console.log(`Batch ${batch.id}: ${chosen.map((slot) => `"${slot.topic}"`).join(", ")}; writer ${batch.writerModel}, critic ${batch.criticModel}`);
  for (const id of specIds) console.log(`Spec ${id}: run ${await startSpec(id)}`);
}

async function generate(batchId: string) {
  console.log(`Confirmed ${await confirmAllSpecs(batchId, db)} specs.`);
  for (const id of await queueGenerations(batchId, {}, db)) console.log(`Generation ${id}: run ${await startGeneration(id, db)}`);
}

async function report(batchId: string) {
  const { rows: specs } = await devPool().query(
    "select s.id, s.status, s.keyword, s.error, p.topic from post_specs s join posts p on p.id = s.post_id where s.batch_id = $1 order by p.slot_date, s.version",
    [batchId],
  );
  console.table(specs);
  const { rows: generations } = await devPool().query(
    "select g.id, g.trigger_run_id, g.status, g.round, g.error, p.status as post_status, p.generation_step from post_generations g join posts p on p.id = g.post_id where g.batch_id = $1 order by g.created_at",
    [batchId],
  );
  console.table(generations);
  const { rows: calls } = await devPool().query(
    `select purpose, requested_model, served_model, effort, input_tokens, output_tokens, cache_write_tokens, cache_read_tokens,
            cost_usd, duration_ms, stop_reason, request_id, error
       from ai_calls where batch_id = $1 order by created_at`,
    [batchId],
  );
  console.table(calls);
}

async function regenerate(postId: string, note: string) {
  const generationId = await queueRegeneration(postId, note, null, db);
  console.log(`Regenerate ${generationId}: run ${await startGeneration(generationId, db)}`);
}

// Stands in for Amir's edits: every sentence holding a placeholder is taken out, as he would where Migss has no
// such fact, then the post is approved and the rule candidates task started.
async function approve(postId: string) {
  const current = await currentText(postId, db);
  if (!current) throw new Error("No draft.");
  const strip = (text: string) =>
    text
      .split(/(?<=[.!?])\s+|\n/)
      .filter((sentence) => findPlaceholders(sentence).length === 0)
      .join(" ");
  const body = current.text.body
    .split(/\n{2,}/)
    .map((paragraph) => (paragraph.startsWith("#") || paragraph.startsWith("-") ? paragraph : strip(paragraph)))
    .filter((paragraph) => paragraph.trim())
    .join("\n\n");
  const text = { title: current.text.title, excerpt: strip(current.text.excerpt), body };
  const result = await approvePost(postId, text, db);
  console.log(`Approved: review event ${result.reviewEventId}, edits ${result.hasEdits}`);
  if (result.hasEdits) console.log(`Rule candidates: run ${await startRuleCandidates(result.reviewEventId)}`);
}

async function postReport(postId: string) {
  const { rows: generations } = await devPool().query(
    "select id, trigger_run_id, status, round, note, error, created_at from post_generations where post_id = $1 order by created_at",
    [postId],
  );
  console.table(generations);
  const { rows: calls } = await devPool().query(
    `select to_char(created_at, 'HH24:MI:SS') as at, purpose, served_model, effort, prompt_version, input_tokens, output_tokens, cache_write_tokens,
            cache_read_tokens, cost_usd, duration_ms, stop_reason, error
       from ai_calls where post_id = $1 order by created_at`,
    [postId],
  );
  for (const call of calls) console.log(Object.values(call).join(" | "));
  const { rows: candidates } = await devPool().query("select tier, section, text, status from rule_candidates where post_id = $1 order by created_at", [postId]);
  console.table(candidates);
  const { rows: post } = await devPool().query("select status, slug from posts where id = $1", [postId]);
  console.table(post);
}

async function main() {
  const [command, id, note] = process.argv.slice(2);
  const batchId = id;
  try {
    if (command === "start") await start();
    else if (command === "generate" && batchId) await generate(batchId);
    else if (command === "report" && batchId) await report(batchId);
    else if (command === "regenerate" && id && note) await regenerate(id, note);
    else if (command === "approve" && id) await approve(id);
    else if (command === "post-report" && id) await postReport(id);
    else throw new Error("Usage: real-run.ts start | generate <batchId> | report <batchId> | regenerate <postId> <note> | approve <postId> | post-report <postId>");
  } finally {
    await devPool().end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
