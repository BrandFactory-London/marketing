import { boolean, check, date, index, integer, jsonb, numeric, pgTable, primaryKey, text, timestamp, unique, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { AdapterAccountType } from "next-auth/adapters";
import type { KnowledgeSections, KnowledgeTier } from "@/config/knowledge";
import { DEFAULT_MODEL } from "@/config/models";
import type { PackageKey, ProjectStatus, PublishingTarget } from "@/config/packages";
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
  mainContact: text("main_contact"),
  email: text("email"),
  phone: text("phone"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// One site that gets marketing content. Package, status and publishing target are checked against the
// keys in src/config/packages.ts; γ3 generates calendar slots from package and status.
export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    siteUrl: text("site_url").notNull(),
    package: text("package").$type<PackageKey>().notNull(),
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
    check("projects_package_check", sql`${table.package} in ('entry', 'mid', 'premium')`),
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
// and publishing to the same record. cadence_date is the package weekday the slot was generated for and
// never changes, so moving slot_date never makes the generator add another slot for that day
// (γ3 orientation Q2). Statuses are the keys in src/config/post-status.ts.
export const posts = pgTable(
  "posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "restrict" }),
    status: text("status").$type<PostStatus>().notNull().default("planned"),
    statusChangedAt: timestamp("status_changed_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    cadenceDate: date("cadence_date", { mode: "string" }),
    slotDate: date("slot_date", { mode: "string" }).notNull(),
    topic: text("topic"),
    topicSetAt: timestamp("topic_set_at", { mode: "date", withTimezone: true }),
    // γ4: the batch the post is being written in, its pillar tag, and which generation step is running.
    batchId: uuid("batch_id").references((): AnyPgColumn => batches.id, { onDelete: "restrict" }),
    pillarId: uuid("pillar_id").references((): AnyPgColumn => projectPillars.id, { onDelete: "set null" }),
    generationStep: text("generation_step").$type<GenerationStep>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("posts_project_cadence_unique").on(table.projectId, table.cadenceDate),
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
    scores: jsonb("scores").$type<Record<string, number>>().notNull(),
    aiCallId: uuid("ai_call_id").references((): AnyPgColumn => aiCalls.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
  },
  (table) => [check("critic_verdicts_verdict_check", sql`${table.verdict} in ('pass', 'fail')`)],
);

export type AiCallPurpose = "spec" | "writer" | "critic" | "check";

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
    createdAt: createdAt(),
  },
  (table) => [
    index("ai_calls_post_id_idx").on(table.postId),
    index("ai_calls_batch_id_idx").on(table.batchId),
    check("ai_calls_purpose_check", sql`${table.purpose} in ('spec', 'writer', 'critic', 'check')`),
  ],
);
