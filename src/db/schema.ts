import { boolean, check, date, index, integer, jsonb, numeric, pgTable, primaryKey, text, timestamp, unique, uniqueIndex, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { AdapterAccountType } from "next-auth/adapters";
import type { KnowledgeSections, KnowledgeTier, RuleScope } from "@/config/knowledge";
import { DEFAULT_MODEL } from "@/config/models";
import type { ProjectStatus, PublishingTarget } from "@/config/projects";
import type { Cadence, RunPresetKey } from "@/config/run-presets";
import type { RunStatus } from "@/config/run-status";
import type { ContentType, DerivedType } from "@/config/content-types";
import type { GenerationStep, PostStatus } from "@/config/post-status";

// Auth.js tables. Property names are what @auth/drizzle-adapter expects.
export const users = pgTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("email_verified", { mode: "date" }),
  image: text("image"),
});

// The token columns exist because the adapter expects them, but the app's adapter wrapper always
// writes them as null. The refresh token lives encrypted in google_tokens.
export const accounts = pgTable(
  "accounts",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (table) => [primaryKey({ columns: [table.provider, table.providerAccountId] })],
);

export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

// One row per user. Token values are AES-GCM ciphertext from src/lib/crypto.ts.
export const googleTokens = pgTable("google_tokens", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  refreshTokenEnc: text("refresh_token_enc").notNull(),
  accessTokenEnc: text("access_token_enc"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { mode: "date", withTimezone: true }),
  scope: text("scope"),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
});

// A single row (id is always 1). Model IDs are plain strings checked against src/config/models.ts.
export const appSettings = pgTable(
  "app_settings",
  {
    id: integer("id").primaryKey().default(1),
    writerModel: text("writer_model").notNull().default(DEFAULT_MODEL),
    criticModel: text("critic_model").notNull().default(DEFAULT_MODEL),
    derivativeModel: text("derivative_model").notNull().default(DEFAULT_MODEL),
    // γ8: the Google Calendar every slot is mirrored to, and whose Google connection writes it (γ8 orientation Q2, Q6).
    calendarUserId: text("calendar_user_id").references((): AnyPgColumn => users.id, { onDelete: "set null" }),
    calendarId: text("calendar_id"),
    calendarName: text("calendar_name"),
    calendarSyncedAt: timestamp("calendar_synced_at", { mode: "date", withTimezone: true }),
    calendarError: text("calendar_error"),
    calendarErrorAt: timestamp("calendar_error_at", { mode: "date", withTimezone: true }),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [check("app_settings_single_row", sql`${table.id} = 1`)],
);

const createdAt = () => timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { mode: "date", withTimezone: true }).notNull().defaultNow();

// Clients own projects. Contact fields are optional (CRM prototype). Clients are never deleted in Phase 1.
export const clients = pgTable("clients", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  // γ8: how the client is named in calendar event titles ("Migss"). Falls back to the name's first word.
  shortName: text("short_name"),
  mainContact: text("main_contact"),
  email: text("email"),
  phone: text("phone"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// One site that gets marketing content. Status and publishing target are checked against the keys in
// src/config/projects.ts. Runs make the slots (Phase 2 A1). The retired package column is left out here, so no query
// names it; it stays in the database until A3's migration drops it, while A2's predecessor may still be live.
export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    siteUrl: text("site_url").notNull(),
    status: text("status").$type<ProjectStatus>().notNull(),
    statusChangedAt: timestamp("status_changed_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    publishingTarget: text("publishing_target").$type<PublishingTarget>().notNull().default("wix_blog"),
    driveFolderId: text("drive_folder_id"),
    driveFolderName: text("drive_folder_name"),
    driveFolderCheckedAt: timestamp("drive_folder_checked_at", { mode: "date", withTimezone: true }),
    sitemapImportedAt: timestamp("sitemap_imported_at", { mode: "date", withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("projects_client_id_idx").on(table.clientId),
    check("projects_status_check", sql`${table.status} in ('active', 'paused')`),
    check("projects_publishing_target_check", sql`${table.publishingTarget} in ('wix_blog')`),
  ],
);

// Every saved version of every knowledge tier (design decision 7). Old versions are kept; later checkpoints
// record which version id each post was written with. The owner columns must match the tier.
export const knowledgeVersions = pgTable(
  "knowledge_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tier: text("tier").$type<KnowledgeTier>().notNull(),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "restrict" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "restrict" }),
    version: integer("version").notNull(),
    sections: jsonb("sections").$type<KnowledgeSections>().notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    unique("knowledge_versions_owner_version_unique")
      .on(table.tier, table.clientId, table.projectId, table.version)
      .nullsNotDistinct(),
    check("knowledge_versions_version_check", sql`${table.version} >= 1`),
    check(
      "knowledge_versions_owner_check",
      sql`(${table.tier} = 'agency' and ${table.clientId} is null and ${table.projectId} is null)
        or (${table.tier} = 'client' and ${table.clientId} is not null and ${table.projectId} is null)
        or (${table.tier} = 'project' and ${table.projectId} is not null and ${table.clientId} is null)`,
    ),
  ],
);

// The project's page list from its sitemap.xml (design decision 8). A re-import replaces the whole list.
export const sitePages = pgTable(
  "site_pages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    path: text("path").notNull(),
    title: text("title").notNull(),
    lastmod: timestamp("lastmod", { mode: "date", withTimezone: true }),
    importedAt: timestamp("imported_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("site_pages_project_url_unique").on(table.projectId, table.url)],
);

// One row per calendar slot. A slot is a post that has not started: γ4 to γ6 add the spec, draft, review
// and publishing to the same record. cadence_date is the day the run's rule gave the slot and never changes,
// so moving slot_date never makes the generator add another slot for that day (γ3 orientation Q2, Phase 2 A1). Statuses are the keys in src/config/post-status.ts.
export const posts = pgTable(
  "posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "restrict" }),
    status: text("status").$type<PostStatus>().notNull().default("planned"),
    statusChangedAt: timestamp("status_changed_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    // Phase 2 A1: the run the slot belongs to. Null only for a slot the retired package generator added during the
    // deploy, which the backstop adopts or removes (orientation Q3).
    runId: uuid("run_id").references((): AnyPgColumn => runs.id, { onDelete: "restrict" }),
    cadenceDate: date("cadence_date", { mode: "string" }),
    slotDate: date("slot_date", { mode: "string" }).notNull(),
    topic: text("topic"),
    topicSetAt: timestamp("topic_set_at", { mode: "date", withTimezone: true }),
    // γ4: the batch the post is being written in, its pillar tag, and which generation step is running.
    batchId: uuid("batch_id").references((): AnyPgColumn => batches.id, { onDelete: "restrict" }),
    pillarId: uuid("pillar_id").references((): AnyPgColumn => projectPillars.id, { onDelete: "set null" }),
    generationStep: text("generation_step").$type<GenerationStep>(),
    // γ5: publishing details for γ6 (the Wix slug and the Drive cover), and when Amir approved the post.
    slug: text("slug"),
    coverDriveFileId: text("cover_drive_file_id"),
    coverName: text("cover_name"),
    coverPath: text("cover_path"),
    coverChosenAt: timestamp("cover_chosen_at", { mode: "date", withTimezone: true }),
    approvedAt: timestamp("approved_at", { mode: "date", withTimezone: true }),
    // γ6: set when the live check confirms the post on the client's site (decision 19).
    publishedAt: timestamp("published_at", { mode: "date", withTimezone: true }),
    liveUrl: text("live_url"),
    // Phase 2 A3: the approved plan's excerpt for this post; A4's auto spec reads it.
    plannedExcerpt: text("planned_excerpt"),
    // γ8: the hash of the calendar event last sent for this post, when, and the last error (γ8 orientation Q2).
    calendarHash: text("calendar_hash"),
    calendarSyncedAt: timestamp("calendar_synced_at", { mode: "date", withTimezone: true }),
    calendarError: text("calendar_error"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("posts_project_cadence_unique").on(table.projectId, table.cadenceDate),
    uniqueIndex("posts_project_slug_unique").on(table.projectId, table.slug).where(sql`${table.slug} is not null`),
    check("posts_slug_check", sql`${table.slug} is null or (${table.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(${table.slug}) <= 80)`),
    index("posts_batch_id_idx").on(table.batchId),
    check("posts_generation_step_check", sql`${table.generationStep} is null or ${table.generationStep} in ('writer', 'critic')`),
    index("posts_slot_date_idx").on(table.slotDate),
    index("posts_project_slot_date_idx").on(table.projectId, table.slotDate),
    check(
      "posts_status_check",
      sql`${table.status} in ('planned', 'topic_set', 'spec_confirmed', 'generating', 'in_review', 'approved', 'published', 'flagged', 'rejected')`,
    ),
    check("posts_topic_check", sql`(${table.status} = 'planned') = (${table.topic} is null)`),
  ],
);

// ---- γ4: batches, specs and generation (design decisions 5, 7, 11, 13, 14) ----

// A project's pillar tags. The slug is the Wix Blog tag slug γ6 publishes with.
export const projectPillars = pgTable(
  "project_pillars",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "restrict" }),
    label: text("label").notNull(),
    slug: text("slug").notNull(),
    position: integer("position").notNull().default(0),
    createdAt: createdAt(),
  },
  (table) => [
    unique("project_pillars_project_slug_unique").on(table.projectId, table.slug),
    check("project_pillars_slug_check", sql`${table.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
  ],
);

// One batch form: the choices that apply to every post in it (decision 14), and the models (decision 13).
export const batches = pgTable(
  "batches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    lengthMin: integer("length_min").notNull(),
    lengthMax: integer("length_max").notNull(),
    cta: text("cta").notNull(),
    faqMode: text("faq_mode").$type<"useful" | "always" | "never">().notNull(),
    defaultPillarId: uuid("default_pillar_id").references(() => projectPillars.id, { onDelete: "set null" }),
    notes: text("notes"),
    writerModel: text("writer_model").notNull(),
    criticModel: text("critic_model").notNull(),
    derivativeModel: text("derivative_model").notNull(),
    // Phase 2 A4: the run a fortnight's batch was made for. Hand-made batches have none.
    runId: uuid("run_id").references((): AnyPgColumn => runs.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
  },
  (table) => [
    index("batches_project_id_idx").on(table.projectId),
    check("batches_length_check", sql`${table.lengthMin} > 0 and ${table.lengthMax} >= ${table.lengthMin}`),
    check("batches_faq_mode_check", sql`${table.faqMode} in ('useful', 'always', 'never')`),
  ],
);

export type SpecStatus = "drafting" | "proposed" | "confirmed" | "superseded" | "failed";

// The writer's spec for one post (decision 14). A redraft adds a version; old versions are kept.
// The spec fields stay empty while the writer is drafting.
export const postSpecs = pgTable(
  "post_specs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "restrict" }),
    batchId: uuid("batch_id")
      .notNull()
      .references(() => batches.id, { onDelete: "restrict" }),
    version: integer("version").notNull(),
    status: text("status").$type<SpecStatus>().notNull(),
    keyword: text("keyword"),
    postType: text("post_type"),
    location: text("location"),
    angle: text("angle"),
    outline: jsonb("outline").$type<string[]>(),
    facts: jsonb("facts").$type<string[]>(),
    links: jsonb("links").$type<string[]>(),
    lengthMin: integer("length_min").notNull(),
    lengthMax: integer("length_max").notNull(),
    cta: text("cta").notNull(),
    faq: boolean("faq"),
    notes: text("notes"),
    redraftNote: text("redraft_note"),
    error: text("error"),
    agencyVersionId: uuid("agency_version_id").references(() => knowledgeVersions.id, { onDelete: "restrict" }),
    clientVersionId: uuid("client_version_id").references(() => knowledgeVersions.id, { onDelete: "restrict" }),
    projectVersionId: uuid("project_version_id").references(() => knowledgeVersions.id, { onDelete: "restrict" }),
    aiCallId: uuid("ai_call_id").references((): AnyPgColumn => aiCalls.id, { onDelete: "restrict" }),
    // Phase 2 A4: drafted from the approved plan and confirmed with no step from Amir (orientation Q7).
    auto: boolean("auto").notNull().default(false),
    createdAt: createdAt(),
    confirmedAt: timestamp("confirmed_at", { mode: "date", withTimezone: true }),
  },
  (table) => [
    unique("post_specs_post_version_unique").on(table.postId, table.version),
    index("post_specs_batch_id_idx").on(table.batchId),
    check("post_specs_status_check", sql`${table.status} in ('drafting', 'proposed', 'confirmed', 'superseded', 'failed')`),
    check("post_specs_length_check", sql`${table.lengthMin} > 0 and ${table.lengthMax} >= ${table.lengthMin}`),
  ],
);

export type GenerationStatus = "queued" | "running" | "in_review" | "flagged" | "failed";

// One Trigger.dev run for one post: writer, checks, critic and up to two fix rounds (decisions 5, 11).
// It records the knowledge versions the drafts were written from (decision 7). A retry is a new row.
export const postGenerations = pgTable(
  "post_generations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "restrict" }),
    specId: uuid("spec_id")
      .notNull()
      .references(() => postSpecs.id, { onDelete: "restrict" }),
    batchId: uuid("batch_id")
      .notNull()
      .references(() => batches.id, { onDelete: "restrict" }),
    triggerRunId: text("trigger_run_id"),
    status: text("status").$type<GenerationStatus>().notNull().default("queued"),
    round: integer("round").notNull().default(0),
    error: text("error"),
    agencyVersionId: uuid("agency_version_id").references(() => knowledgeVersions.id, { onDelete: "restrict" }),
    clientVersionId: uuid("client_version_id").references(() => knowledgeVersions.id, { onDelete: "restrict" }),
    projectVersionId: uuid("project_version_id").references(() => knowledgeVersions.id, { onDelete: "restrict" }),
    // γ5 regenerate with a note: Amir's note and the version the writer starts from. Both null for a batch run.
    note: text("note"),
    baseVersionId: uuid("base_version_id").references((): AnyPgColumn => postVersions.id, { onDelete: "restrict" }),
    startedAt: timestamp("started_at", { mode: "date", withTimezone: true }),
    finishedAt: timestamp("finished_at", { mode: "date", withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("post_generations_post_id_idx").on(table.postId),
    index("post_generations_batch_id_idx").on(table.batchId),
    check("post_generations_status_check", sql`${table.status} in ('queued', 'running', 'in_review', 'flagged', 'failed')`),
    check("post_generations_round_check", sql`${table.round} between 0 and 3`),
  ],
);

// Every draft the writer produced, one per round, with the scripted check results (decision 11).
export const postDrafts = pgTable(
  "post_drafts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    generationId: uuid("generation_id")
      .notNull()
      .references(() => postGenerations.id, { onDelete: "restrict" }),
    round: integer("round").notNull(),
    title: text("title").notNull(),
    excerpt: text("excerpt"),
    bodyMd: text("body_md").notNull(),
    wordCount: integer("word_count").notNull(),
    checks: jsonb("checks").notNull(),
    checksPassed: boolean("checks_passed").notNull(),
    aiCallId: uuid("ai_call_id").references((): AnyPgColumn => aiCalls.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
  },
  (table) => [
    unique("post_drafts_generation_round_unique").on(table.generationId, table.round),
    check("post_drafts_round_check", sql`${table.round} between 1 and 3`),
  ],
);

export type CriticIssue = { quote: string; category: string; note: string; severity: "blocking" | "minor" };
export type CriticPlaceholder = { quote: string; ask: string };

// The critic's structured verdict on one draft (decisions 11, 12).
export const criticVerdicts = pgTable(
  "critic_verdicts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    draftId: uuid("draft_id")
      .notNull()
      .unique("critic_verdicts_draft_unique")
      .references(() => postDrafts.id, { onDelete: "restrict" }),
    verdict: text("verdict").$type<"pass" | "fail">().notNull(),
    summary: text("summary"),
    issues: jsonb("issues").$type<CriticIssue[]>().notNull(),
    // γ5: what Amir must supply for each placeholder. Null on γ4 verdicts.
    placeholders: jsonb("placeholders").$type<CriticPlaceholder[]>(),
    scores: jsonb("scores").$type<Record<string, number>>().notNull(),
    aiCallId: uuid("ai_call_id").references((): AnyPgColumn => aiCalls.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
  },
  (table) => [check("critic_verdicts_verdict_check", sql`${table.verdict} in ('pass', 'fail')`)],
);

// Backlog 24: the candidates a run dropped, with the reason for each, or the raw reply it could not read.
export type UnstoredReply = { dropped?: { candidate: unknown; reason: string; matched?: string }[]; raw?: string };

export type AiCallPurpose = "spec" | "writer" | "critic" | "check" | "rules" | "derivative" | "facts" | "plan";

// Every Anthropic API call: who asked, which model answered, tokens and cost (Q7). Failed calls are
// recorded too, with their error.
export const aiCalls = pgTable(
  "ai_calls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    batchId: uuid("batch_id").references((): AnyPgColumn => batches.id, { onDelete: "restrict" }),
    postId: uuid("post_id").references((): AnyPgColumn => posts.id, { onDelete: "restrict" }),
    purpose: text("purpose").$type<AiCallPurpose>().notNull(),
    requestedModel: text("requested_model").notNull(),
    servedModel: text("served_model"),
    promptVersion: text("prompt_version").notNull(),
    effort: text("effort"),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    cacheWriteTokens: integer("cache_write_tokens").notNull().default(0),
    cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
    costUsd: numeric("cost_usd", { precision: 12, scale: 6, mode: "number" }).notNull().default(0),
    durationMs: integer("duration_ms").notNull().default(0),
    stopReason: text("stop_reason"),
    requestId: text("request_id"),
    error: text("error"),
    // γ8, backlog 24: what a candidate run got back but could not store, and why.
    unstored: jsonb("unstored").$type<UnstoredReply>(),
    // Phase 2 A4: made through the Message Batches API, so priced at half (orientation Q7).
    batch: boolean("batch").notNull().default(false),
    createdAt: createdAt(),
  },
  (table) => [
    index("ai_calls_post_id_idx").on(table.postId),
    index("ai_calls_batch_id_idx").on(table.batchId),
    check("ai_calls_purpose_check", sql`${table.purpose} in ('spec', 'writer', 'critic', 'check', 'rules', 'derivative', 'facts', 'plan')`),
  ],
);

// ---- γ5: review, approval and rule candidates (design decisions 17, 18) ----

// Amir's saved edits of a post. The writer's drafts stay untouched in post_drafts; the post's current text is
// the newest of its latest draft and its latest saved version.
export const postVersions = pgTable(
  "post_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "restrict" }),
    generationId: uuid("generation_id")
      .notNull()
      .references((): AnyPgColumn => postGenerations.id, { onDelete: "restrict" }),
    version: integer("version").notNull(),
    title: text("title").notNull(),
    excerpt: text("excerpt"),
    bodyMd: text("body_md").notNull(),
    wordCount: integer("word_count").notNull(),
    checks: jsonb("checks").notNull(),
    createdAt: createdAt(),
  },
  (table) => [unique("post_versions_post_version_unique").on(table.postId, table.version), check("post_versions_version_check", sql`${table.version} >= 1`)],
);

export type ReviewAction = "approve" | "reject" | "regenerate" | "reopen";

// What Amir did with a post in Review. An approve keeps the diff from the writer's last draft to his text.
export const reviewEvents = pgTable(
  "review_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "restrict" }),
    action: text("action").$type<ReviewAction>().notNull(),
    note: text("note"),
    versionId: uuid("version_id").references(() => postVersions.id, { onDelete: "restrict" }),
    draftId: uuid("draft_id").references(() => postDrafts.id, { onDelete: "restrict" }),
    diff: jsonb("diff").$type<EditHunk[]>(),
    // Check failures Amir approved with, as warnings.
    warnings: jsonb("warnings").$type<{ check: string; message: string }[]>(),
    createdAt: createdAt(),
  },
  (table) => [
    index("review_events_post_id_idx").on(table.postId),
    check("review_events_action_check", sql`${table.action} in ('approve', 'reject', 'regenerate', 'reopen')`),
  ],
);

export type EditHunk = { before: string; after: string };

export type CandidateStatus = "proposed" | "accepted" | "dismissed";
export type CandidateKind = "rule" | "fact";

// A rule Claude proposes from Amir's edits, for him to accept into a knowledge tier or dismiss (decision 17).
export const ruleCandidates = pgTable(
  "rule_candidates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Where it came from: a review event on the blog post, (γ7) a derivative version's note or edit, or (Phase 2 A3) a
    // note on a plan or a client's comment on it. Exactly one.
    reviewEventId: uuid("review_event_id").references(() => reviewEvents.id, { onDelete: "restrict" }),
    derivativeId: uuid("derivative_id").references((): AnyPgColumn => derivatives.id, { onDelete: "restrict" }),
    planFeedbackId: uuid("plan_feedback_id").references((): AnyPgColumn => planFeedback.id, { onDelete: "restrict" }),
    // The post it is about. A note on a whole plan is about no single post (A3).
    postId: uuid("post_id").references(() => posts.id, { onDelete: "restrict" }),
    tier: text("tier").$type<KnowledgeTier>().notNull(),
    section: text("section").notNull(),
    text: text("text").notNull(),
    before: text("before"),
    after: text("after"),
    reason: text("reason"),
    status: text("status").$type<CandidateStatus>().notNull().default("proposed"),
    // γ6: "fact" for a fact proposed from a regenerate note (γ6 orientation Q7).
    kind: text("kind").$type<CandidateKind>().notNull().default("rule"),
    // γ7: the channel a rule applies to, or every channel (γ7 orientation Q1, Q6).
    scope: text("scope").$type<RuleScope>().notNull().default("all"),
    knowledgeVersionId: uuid("knowledge_version_id").references(() => knowledgeVersions.id, { onDelete: "restrict" }),
    aiCallId: uuid("ai_call_id").references(() => aiCalls.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
    decidedAt: timestamp("decided_at", { mode: "date", withTimezone: true }),
  },
  (table) => [
    index("rule_candidates_status_idx").on(table.status),
    check("rule_candidates_tier_check", sql`${table.tier} in ('agency', 'client', 'project')`),
    check("rule_candidates_status_check", sql`${table.status} in ('proposed', 'accepted', 'dismissed')`),
    check("rule_candidates_kind_check", sql`${table.kind} in ('rule', 'fact')`),
    check("rule_candidates_scope_check", sql`${table.scope} in ('all', 'blog', 'gmb', 'linkedin', 'facebook', 'pinterest')`),
    check(
      "rule_candidates_source_check",
      sql`(case when ${table.reviewEventId} is null then 0 else 1 end) + (case when ${table.derivativeId} is null then 0 else 1 end) + (case when ${table.planFeedbackId} is null then 0 else 1 end) = 1`,
    ),
  ],
);

// ---- γ6: publishing to Wix and derivatives (design decisions 6, 18, 19, 20) ----

// A project's Wix credentials (decision 6). The API key, account ID and site ID are one AES-GCM ciphertext
// (src/lib/crypto.ts) bound to the project; only the key's last four characters are ever shown again.
export const projectWix = pgTable("project_wix", {
  projectId: uuid("project_id")
    .primaryKey()
    .references(() => projects.id, { onDelete: "restrict" }),
  credentialsEnc: text("credentials_enc").notNull(),
  keyHint: text("key_hint").notNull(),
  // The Wix site member every post is published as.
  memberId: text("member_id"),
  memberName: text("member_name"),
  checkedAt: timestamp("checked_at", { mode: "date", withTimezone: true }),
  checkOk: boolean("check_ok"),
  checkMessage: text("check_message"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export type PublicationState = "running" | "failed" | "checking" | "live" | "not_confirmed";
export type PublishStep = "cover" | "tag" | "draft" | "publish" | "live";

// One post's publication on its project's target (decisions 18, 19, γ6 orientation Q4). Every Wix ID is recorded as
// soon as Wix returns it, so a retry resumes from the failed step and never creates a second post.
export const postPublications = pgTable(
  "post_publications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postId: uuid("post_id")
      .notNull()
      .unique("post_publications_post_unique")
      .references(() => posts.id, { onDelete: "restrict" }),
    target: text("target").notNull().default("wix_blog"),
    state: text("state").$type<PublicationState>().notNull(),
    step: text("step").$type<PublishStep>(),
    coverDriveFileId: text("cover_drive_file_id"),
    wixFileId: text("wix_file_id"),
    wixTagId: text("wix_tag_id"),
    wixDraftId: text("wix_draft_id"),
    wixPostId: text("wix_post_id"),
    wixSlug: text("wix_slug"),
    liveUrl: text("live_url"),
    error: text("error"),
    triggerRunId: text("trigger_run_id"),
    heartbeatAt: timestamp("heartbeat_at", { mode: "date", withTimezone: true }),
    checkStartedAt: timestamp("check_started_at", { mode: "date", withTimezone: true }),
    confirmedAt: timestamp("confirmed_at", { mode: "date", withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    check("post_publications_target_check", sql`${table.target} in ('wix_blog')`),
    check("post_publications_state_check", sql`${table.state} in ('running', 'failed', 'checking', 'live', 'not_confirmed')`),
    check("post_publications_step_check", sql`${table.step} is null or ${table.step} in ('cover', 'tag', 'draft', 'publish', 'live')`),
  ],
);

// The log of every publish step: what was sent, what Wix or the live page answered (the scope's publish event).
export const publishEvents = pgTable(
  "publish_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publicationId: uuid("publication_id")
      .notNull()
      .references(() => postPublications.id, { onDelete: "restrict" }),
    step: text("step").$type<PublishStep>().notNull(),
    result: text("result").$type<"ok" | "failed">().notNull(),
    httpStatus: integer("http_status"),
    message: text("message"),
    requestId: text("request_id"),
    details: jsonb("details").$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (table) => [
    index("publish_events_publication_id_idx").on(table.publicationId),
    check("publish_events_step_check", sql`${table.step} in ('cover', 'tag', 'draft', 'publish', 'live')`),
    check("publish_events_result_check", sql`${table.result} in ('ok', 'failed')`),
  ],
);

export type DerivativeChannel = "gmb" | "linkedin" | "facebook" | "pinterest";
export type DerivativeStatus = "writing" | "ready" | "failed";

// GBP, LinkedIn, Facebook and Pinterest copy from an approved post (decision 20, γ7). Every generation and every saved edit is a version.
export const derivatives = pgTable(
  "derivatives",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "restrict" }),
    channel: text("channel").$type<DerivativeChannel>().notNull(),
    version: integer("version").notNull(),
    status: text("status").$type<DerivativeStatus>().notNull(),
    source: text("source").$type<"model" | "edit">().notNull(),
    // γ7: a Pinterest pin's title; body holds its description. Null on every other channel.
    title: text("title"),
    body: text("body"),
    checks: jsonb("checks"),
    note: text("note"),
    error: text("error"),
    triggerRunId: text("trigger_run_id"),
    aiCallId: uuid("ai_call_id").references(() => aiCalls.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("derivatives_post_channel_version_unique").on(table.postId, table.channel, table.version),
    check("derivatives_channel_check", sql`${table.channel} in ('gmb', 'linkedin', 'facebook', 'pinterest')`),
    check("derivatives_status_check", sql`${table.status} in ('writing', 'ready', 'failed')`),
    check("derivatives_source_check", sql`${table.source} in ('model', 'edit')`),
    check("derivatives_version_check", sql`${table.version} >= 1`),
  ],
);

// ---- γ8: Google Calendar (γ8 orientation Q4, Q6) ----

// A slot deleted by a run change whose calendar event still has to go. The record is gone, so there is no foreign key;
// post_id holds an SEO post's ID or, from Phase 2 A1, a derived slot's.
export const calendarDeletions = pgTable("calendar_deletions", {
  postId: uuid("post_id").primaryKey(),
  eventId: text("event_id").notNull(),
  attempts: integer("attempts").notNull().default(0),
  error: text("error"),
  createdAt: createdAt(),
});

// ---- Phase 2 session A1: runs (orientation Q1 to Q4) ----

// A block of content for one project: 1 to 3 months, an amount and a cadence per content type, and priority notes.
// Runs of one project never overlap; the migration adds an exclusion constraint for that, which this file cannot express.
export const runs = pgTable(
  "runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    preset: text("preset").$type<RunPresetKey>().notNull(),
    startsOn: date("starts_on", { mode: "string" }).notNull(),
    endsOn: date("ends_on", { mode: "string" }).notNull(),
    priorityNotes: text("priority_notes"),
    status: text("status").$type<RunStatus>().notNull().default("setting_up"),
    // Run 1: made by the migration from the project's Phase 1 slots, and written through hand-made batches.
    imported: boolean("imported").notNull().default(false),
    // The post defaults the batch form asks for today; A4's batches take them.
    lengthMin: integer("length_min").notNull().default(1200),
    lengthMax: integer("length_max").notNull().default(1600),
    cta: text("cta"),
    faqMode: text("faq_mode").$type<"useful" | "always" | "never">().notNull().default("useful"),
    writerModel: text("writer_model").notNull().default(DEFAULT_MODEL),
    criticModel: text("critic_model").notNull().default(DEFAULT_MODEL),
    planApprovedAt: timestamp("plan_approved_at", { mode: "date", withTimezone: true }),
    clientApprovedAt: timestamp("client_approved_at", { mode: "date", withTimezone: true }),
    // A3: the name the client gave when approving the plan through the link.
    clientApprovedBy: text("client_approved_by"),
    // A4: whether the schedule generates this run's posts, and the next day it does (orientation Q7).
    autoGenerate: boolean("auto_generate").notNull().default(false),
    nextGenerationOn: date("next_generation_on", { mode: "string" }),
    activatedAt: timestamp("activated_at", { mode: "date", withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("runs_project_id_idx").on(table.projectId),
    check("runs_dates_check", sql`${table.endsOn} >= ${table.startsOn}`),
    check("runs_preset_check", sql`${table.preset} in ('entry', 'mid', 'premium', 'custom')`),
    check("runs_status_check", sql`${table.status} in ('setting_up', 'planning', 'plan_approved', 'active')`),
    check("runs_length_check", sql`${table.lengthMin} > 0 and ${table.lengthMax} >= ${table.lengthMin}`),
    check("runs_faq_mode_check", sql`${table.faqMode} in ('useful', 'always', 'never')`),
  ],
);

// A run's amount and cadence for one content type.
export const runChannels = pgTable(
  "run_channels",
  {
    runId: uuid("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    contentType: text("content_type").$type<ContentType>().notNull(),
    amount: integer("amount").notNull(),
    cadence: jsonb("cadence").$type<Cadence>().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.runId, table.contentType] }),
    check("run_channels_type_check", sql`${table.contentType} in ('seo', 'gmb', 'linkedin', 'facebook', 'pinterest')`),
    check("run_channels_amount_check", sql`${table.amount} >= 0`),
  ],
);

// A dated placeholder for a post derived from an SEO post (orientation Q2). Its text is the newest derivatives version
// for its parent and channel, so γ6 and γ7's versions are joined, never reshaped. One per channel per SEO post.
export const derivedSlots = pgTable(
  "derived_slots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "restrict" }),
    parentPostId: uuid("parent_post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "restrict" }),
    contentType: text("content_type").$type<DerivedType>().notNull(),
    slotDate: date("slot_date", { mode: "string" }).notNull(),
    // The date its rule gave; a slot moved by hand keeps it, so a rule change leaves it alone.
    cadenceDate: date("cadence_date", { mode: "string" }).notNull(),
    calendarHash: text("calendar_hash"),
    calendarSyncedAt: timestamp("calendar_synced_at", { mode: "date", withTimezone: true }),
    calendarError: text("calendar_error"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("derived_slots_parent_type_unique").on(table.parentPostId, table.contentType),
    index("derived_slots_run_id_idx").on(table.runId),
    index("derived_slots_slot_date_idx").on(table.slotDate),
    check("derived_slots_type_check", sql`${table.contentType} in ('gmb', 'linkedin', 'facebook', 'pinterest')`),
  ],
);

// ---- Phase 2 A3: categories, the planner and the client link ----

// A project's topic categories (orientation amendment, Q5), like its pillars. "Other" is every project's last
// category and is never stored (src/config/plan.ts). Session B's gap grid reads the same list.
export const projectCategories = pgTable(
  "project_categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "restrict" }),
    label: text("label").notNull(),
    position: integer("position").notNull().default(0),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("project_categories_project_label_unique").on(table.projectId, sql`lower(${table.label})`)],
);

export type PlanDraftScope = "plan" | "item";
export type PlanDraftStatus = "drafting" | "done" | "failed";

// One planner call: the whole plan, or one item again (orientation Q5). Its items point back to it.
export const planDrafts = pgTable(
  "plan_drafts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "restrict" }),
    scope: text("scope").$type<PlanDraftScope>().notNull(),
    // For one item: the SEO post it is for.
    postId: uuid("post_id").references(() => posts.id, { onDelete: "restrict" }),
    note: text("note"),
    status: text("status").$type<PlanDraftStatus>().notNull().default("drafting"),
    error: text("error"),
    triggerRunId: text("trigger_run_id"),
    aiCallId: uuid("ai_call_id").references(() => aiCalls.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("plan_drafts_run_id_idx").on(table.runId),
    check("plan_drafts_scope_check", sql`${table.scope} in ('plan', 'item')`),
    check("plan_drafts_status_check", sql`${table.status} in ('drafting', 'done', 'failed')`),
    check("plan_drafts_item_check", sql`(${table.scope} = 'item') = (${table.postId} is not null)`),
  ],
);

export type PlanItemStatus = "proposed" | "approved" | "replaced";

// A planned SEO post: title, excerpt, pillar, category and why (orientation Q5). Old versions stay as replaced.
export const planItems = pgTable(
  "plan_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "restrict" }),
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "restrict" }),
    draftId: uuid("draft_id")
      .notNull()
      .references(() => planDrafts.id, { onDelete: "restrict" }),
    version: integer("version").notNull(),
    title: text("title").notNull(),
    excerpt: text("excerpt").notNull(),
    // A removed pillar leaves the item with none, as it does for posts.
    pillarId: uuid("pillar_id").references(() => projectPillars.id, { onDelete: "set null" }),
    category: text("category").notNull(),
    reason: text("reason").notNull(),
    // The covered title or page this one is close to, if any (orientation Q5).
    closeTo: text("close_to"),
    status: text("status").$type<PlanItemStatus>().notNull().default("proposed"),
    createdAt: createdAt(),
  },
  (table) => [
    unique("plan_items_post_version_unique").on(table.postId, table.version),
    index("plan_items_run_id_idx").on(table.runId),
    check("plan_items_status_check", sql`${table.status} in ('proposed', 'approved', 'replaced')`),
    check("plan_items_version_check", sql`${table.version} >= 1`),
  ],
);

// A private, read-only link to a run's plan for the client (orientation Q6). Only the token's SHA-256 is stored.
export const planShares = pgTable(
  "plan_shares",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "restrict" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { mode: "date", withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { mode: "date", withTimezone: true }),
    lastViewedAt: timestamp("last_viewed_at", { mode: "date", withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [unique("plan_shares_token_hash_unique").on(table.tokenHash), index("plan_shares_run_id_idx").on(table.runId)],
);

export type PlanFeedbackKind = "comment" | "suggest" | "approve" | "note";

// What was said about a plan: the client's comments, suggestions and approval through a link, and Amir's own notes
// when he regenerates an item or the plan (kind "note", no link). Bodies are plain text, never rendered as HTML.
export const planFeedback = pgTable(
  "plan_feedback",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "restrict" }),
    shareId: uuid("share_id").references(() => planShares.id, { onDelete: "restrict" }),
    // The item it is about; none for the whole plan.
    planItemId: uuid("plan_item_id").references(() => planItems.id, { onDelete: "restrict" }),
    postId: uuid("post_id").references(() => posts.id, { onDelete: "restrict" }),
    kind: text("kind").$type<PlanFeedbackKind>().notNull(),
    name: text("name").notNull(),
    body: text("body"),
    ipHash: text("ip_hash"),
    seenAt: timestamp("seen_at", { mode: "date", withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    index("plan_feedback_run_id_idx").on(table.runId),
    index("plan_feedback_share_id_idx").on(table.shareId),
    check("plan_feedback_kind_check", sql`${table.kind} in ('comment', 'suggest', 'approve', 'note')`),
    check("plan_feedback_body_check", sql`${table.body} is null or length(${table.body}) <= 2000`),
    check("plan_feedback_source_check", sql`(${table.kind} = 'note') = (${table.shareId} is null)`),
  ],
);

// ---- Phase 2 A4: fortnightly generation through the Message Batches API ----

// One request in a submitted round, so its result can be matched to the step it was for.
// Its outcome is filled in when the round's results are saved.
export type BatchRequestRef = { customId: string; kind: "spec" | "writer" | "critic"; id: string; round: number; attempt: number; outcome?: "ok" | "retry" | "failed" };
export type GenerationBatchStatus = "submitted" | "ended" | "failed";

// One round of a fortnight's generation: every post's next call, submitted as one Anthropic message batch (Q7).
export const generationBatches = pgTable(
  "generation_batches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "restrict" }),
    batchId: uuid("batch_id")
      .notNull()
      .references(() => batches.id, { onDelete: "restrict" }),
    round: integer("round").notNull(),
    anthropicBatchId: text("anthropic_batch_id"),
    requestCount: integer("request_count").notNull(),
    requests: jsonb("requests").$type<BatchRequestRef[]>().notNull(),
    status: text("status").$type<GenerationBatchStatus>().notNull().default("submitted"),
    error: text("error"),
    submittedAt: timestamp("submitted_at", { mode: "date", withTimezone: true }),
    endedAt: timestamp("ended_at", { mode: "date", withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    unique("generation_batches_anthropic_unique").on(table.anthropicBatchId),
    unique("generation_batches_round_unique").on(table.batchId, table.round),
    index("generation_batches_run_id_idx").on(table.runId),
    check("generation_batches_status_check", sql`${table.status} in ('submitted', 'ended', 'failed')`),
  ],
);

