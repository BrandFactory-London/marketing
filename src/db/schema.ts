import { check, date, index, integer, jsonb, pgTable, primaryKey, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { AdapterAccountType } from "next-auth/adapters";
import type { KnowledgeSections, KnowledgeTier } from "@/config/knowledge";
import { DEFAULT_MODEL } from "@/config/models";
import type { PackageKey, ProjectStatus, PublishingTarget } from "@/config/packages";
import type { PostStatus } from "@/config/post-status";

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
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("posts_project_cadence_unique").on(table.projectId, table.cadenceDate),
    index("posts_slot_date_idx").on(table.slotDate),
    index("posts_project_slot_date_idx").on(table.projectId, table.slotDate),
    check(
      "posts_status_check",
      sql`${table.status} in ('planned', 'topic_set', 'spec_confirmed', 'generating', 'in_review', 'approved', 'published', 'flagged', 'rejected')`,
    ),
    check("posts_topic_check", sql`(${table.status} = 'planned') = (${table.topic} is null)`),
  ],
);
