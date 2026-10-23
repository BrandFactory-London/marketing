CREATE TABLE "derived_slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"parent_post_id" uuid NOT NULL,
	"content_type" text NOT NULL,
	"slot_date" date NOT NULL,
	"cadence_date" date NOT NULL,
	"calendar_hash" text,
	"calendar_synced_at" timestamp with time zone,
	"calendar_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "derived_slots_parent_type_unique" UNIQUE("parent_post_id","content_type"),
	CONSTRAINT "derived_slots_type_check" CHECK ("derived_slots"."content_type" in ('gmb', 'linkedin', 'facebook', 'pinterest'))
);
--> statement-breakpoint
CREATE TABLE "run_channels" (
	"run_id" uuid NOT NULL,
	"content_type" text NOT NULL,
	"amount" integer NOT NULL,
	"cadence" jsonb NOT NULL,
	CONSTRAINT "run_channels_run_id_content_type_pk" PRIMARY KEY("run_id","content_type"),
	CONSTRAINT "run_channels_type_check" CHECK ("run_channels"."content_type" in ('seo', 'gmb', 'linkedin', 'facebook', 'pinterest')),
	CONSTRAINT "run_channels_amount_check" CHECK ("run_channels"."amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"preset" text NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"priority_notes" text,
	"status" text DEFAULT 'setting_up' NOT NULL,
	"imported" boolean DEFAULT false NOT NULL,
	"length_min" integer DEFAULT 1200 NOT NULL,
	"length_max" integer DEFAULT 1600 NOT NULL,
	"cta" text,
	"faq_mode" text DEFAULT 'useful' NOT NULL,
	"writer_model" text DEFAULT 'claude-opus-5-5' NOT NULL,
	"critic_model" text DEFAULT 'claude-opus-5-5' NOT NULL,
	"plan_approved_at" timestamp with time zone,
	"client_approved_at" timestamp with time zone,
	"activated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "runs_dates_check" CHECK ("runs"."ends_on" >= "runs"."starts_on"),
	CONSTRAINT "runs_preset_check" CHECK ("runs"."preset" in ('entry', 'mid', 'premium', 'custom')),
	CONSTRAINT "runs_status_check" CHECK ("runs"."status" in ('setting_up', 'planning', 'plan_approved', 'active')),
	CONSTRAINT "runs_length_check" CHECK ("runs"."length_min" > 0 and "runs"."length_max" >= "runs"."length_min"),
	CONSTRAINT "runs_faq_mode_check" CHECK ("runs"."faq_mode" in ('useful', 'always', 'never'))
);
--> statement-breakpoint
ALTER TABLE "projects" DROP CONSTRAINT "projects_package_check";--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "package" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "run_id" uuid;--> statement-breakpoint
ALTER TABLE "derived_slots" ADD CONSTRAINT "derived_slots_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "derived_slots" ADD CONSTRAINT "derived_slots_parent_post_id_posts_id_fk" FOREIGN KEY ("parent_post_id") REFERENCES "public"."posts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_channels" ADD CONSTRAINT "run_channels_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "derived_slots_run_id_idx" ON "derived_slots" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "derived_slots_slot_date_idx" ON "derived_slots" USING btree ("slot_date");--> statement-breakpoint
CREATE INDEX "runs_project_id_idx" ON "runs" USING btree ("project_id");--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_package_check" CHECK ("projects"."package" is null or "projects"."package" in ('entry', 'mid', 'premium'));--> statement-breakpoint
-- Hand-written (Phase 2 A1, orientation Q1): runs of one project never share a day.
CREATE EXTENSION IF NOT EXISTS btree_gist;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_no_overlap" EXCLUDE USING gist ("project_id" WITH =, daterange("starts_on", "ends_on", '[]') WITH &&);--> statement-breakpoint
-- Hand-written (orientation Q3 as amended at approval): each project's Phase 1 slots become Run 1. It starts on the first
-- slot and ends on the last post with a topic (the latest slot if none has one), and never before a past slot.
INSERT INTO "runs" ("project_id", "name", "preset", "starts_on", "ends_on", "status", "imported", "writer_model", "critic_model", "activated_at")
SELECT b."project_id", 'Run 1', coalesce(b."package", 'custom'), b."first_day",
       greatest(coalesce(b."last_topic_day", b."last_day"), b."last_past_day"), 'active', true,
       coalesce((SELECT "writer_model" FROM "app_settings" WHERE "id" = 1), 'claude-opus-5-5'),
       coalesce((SELECT "critic_model" FROM "app_settings" WHERE "id" = 1), 'claude-opus-5-5'),
       now()
FROM (
  SELECT p."id" AS "project_id", p."package",
         min(po."slot_date") AS "first_day",
         max(po."slot_date") AS "last_day",
         max(po."slot_date") FILTER (WHERE po."topic" IS NOT NULL) AS "last_topic_day",
         max(po."slot_date") FILTER (WHERE po."slot_date" < (now() AT TIME ZONE 'Europe/London')::date) AS "last_past_day"
  FROM "projects" p
  JOIN "posts" po ON po."project_id" = p."id"
  GROUP BY p."id", p."package"
) b;--> statement-breakpoint
-- The empty future placeholders after Run 1's end go, with their calendar events (approved by Amir, 23 Oct 2026).
INSERT INTO "calendar_deletions" ("post_id", "event_id")
SELECT po."id", 'bfm' || replace(po."id"::text, '-', '')
FROM "posts" po
JOIN "runs" r ON r."project_id" = po."project_id" AND r."imported"
WHERE po."status" = 'planned' AND po."topic" IS NULL AND po."batch_id" IS NULL AND po."slot_date" > r."ends_on"
ON CONFLICT DO NOTHING;--> statement-breakpoint
DELETE FROM "posts" po
USING "runs" r
WHERE r."project_id" = po."project_id" AND r."imported"
  AND po."status" = 'planned' AND po."topic" IS NULL AND po."batch_id" IS NULL AND po."slot_date" > r."ends_on";--> statement-breakpoint
UPDATE "posts" po SET "run_id" = r."id"
FROM "runs" r
WHERE r."project_id" = po."project_id" AND r."imported";--> statement-breakpoint
-- Run 1's SEO row: every post it holds, on the package's weekdays.
INSERT INTO "run_channels" ("run_id", "content_type", "amount", "cadence")
SELECT r."id", 'seo', (SELECT count(*) FROM "posts" po WHERE po."run_id" = r."id"),
       CASE r."preset" WHEN 'entry' THEN '{"weekdays":[2]}' WHEN 'mid' THEN '{"weekdays":[2,4]}' WHEN 'premium' THEN '{"weekdays":[1,3,5]}' ELSE '{"weekdays":[]}' END::jsonb
FROM "runs" r
WHERE r."imported";
