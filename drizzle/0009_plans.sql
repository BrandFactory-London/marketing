CREATE TABLE "plan_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"scope" text NOT NULL,
	"post_id" uuid,
	"note" text,
	"status" text DEFAULT 'drafting' NOT NULL,
	"error" text,
	"trigger_run_id" text,
	"ai_call_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_drafts_scope_check" CHECK ("plan_drafts"."scope" in ('plan', 'item')),
	CONSTRAINT "plan_drafts_status_check" CHECK ("plan_drafts"."status" in ('drafting', 'done', 'failed')),
	CONSTRAINT "plan_drafts_item_check" CHECK (("plan_drafts"."scope" = 'item') = ("plan_drafts"."post_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "plan_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"share_id" uuid,
	"plan_item_id" uuid,
	"post_id" uuid,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"body" text,
	"ip_hash" text,
	"seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_feedback_kind_check" CHECK ("plan_feedback"."kind" in ('comment', 'suggest', 'approve', 'note')),
	CONSTRAINT "plan_feedback_body_check" CHECK ("plan_feedback"."body" is null or length("plan_feedback"."body") <= 2000),
	CONSTRAINT "plan_feedback_source_check" CHECK (("plan_feedback"."kind" = 'note') = ("plan_feedback"."share_id" is null))
);
--> statement-breakpoint
CREATE TABLE "plan_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"post_id" uuid NOT NULL,
	"draft_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"title" text NOT NULL,
	"excerpt" text NOT NULL,
	"pillar_id" uuid,
	"category" text NOT NULL,
	"reason" text NOT NULL,
	"close_to" text,
	"status" text DEFAULT 'proposed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_items_post_version_unique" UNIQUE("post_id","version"),
	CONSTRAINT "plan_items_status_check" CHECK ("plan_items"."status" in ('proposed', 'approved', 'replaced')),
	CONSTRAINT "plan_items_version_check" CHECK ("plan_items"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "plan_shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"last_viewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_shares_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "project_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"label" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_calls" DROP CONSTRAINT "ai_calls_purpose_check";--> statement-breakpoint
ALTER TABLE "projects" DROP CONSTRAINT "projects_package_check";--> statement-breakpoint
ALTER TABLE "rule_candidates" DROP CONSTRAINT "rule_candidates_source_check";--> statement-breakpoint
ALTER TABLE "rule_candidates" ALTER COLUMN "post_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "planned_excerpt" text;--> statement-breakpoint
ALTER TABLE "rule_candidates" ADD COLUMN "plan_feedback_id" uuid;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "client_approved_by" text;--> statement-breakpoint
ALTER TABLE "plan_drafts" ADD CONSTRAINT "plan_drafts_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_drafts" ADD CONSTRAINT "plan_drafts_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_drafts" ADD CONSTRAINT "plan_drafts_ai_call_id_ai_calls_id_fk" FOREIGN KEY ("ai_call_id") REFERENCES "public"."ai_calls"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_feedback" ADD CONSTRAINT "plan_feedback_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_feedback" ADD CONSTRAINT "plan_feedback_share_id_plan_shares_id_fk" FOREIGN KEY ("share_id") REFERENCES "public"."plan_shares"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_feedback" ADD CONSTRAINT "plan_feedback_plan_item_id_plan_items_id_fk" FOREIGN KEY ("plan_item_id") REFERENCES "public"."plan_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_feedback" ADD CONSTRAINT "plan_feedback_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_items" ADD CONSTRAINT "plan_items_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_items" ADD CONSTRAINT "plan_items_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_items" ADD CONSTRAINT "plan_items_draft_id_plan_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."plan_drafts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_items" ADD CONSTRAINT "plan_items_pillar_id_project_pillars_id_fk" FOREIGN KEY ("pillar_id") REFERENCES "public"."project_pillars"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_shares" ADD CONSTRAINT "plan_shares_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_categories" ADD CONSTRAINT "project_categories_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "plan_drafts_run_id_idx" ON "plan_drafts" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "plan_feedback_run_id_idx" ON "plan_feedback" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "plan_feedback_share_id_idx" ON "plan_feedback" USING btree ("share_id");--> statement-breakpoint
CREATE INDEX "plan_items_run_id_idx" ON "plan_items" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "plan_shares_run_id_idx" ON "plan_shares" USING btree ("run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_categories_project_label_unique" ON "project_categories" USING btree ("project_id",lower("label"));--> statement-breakpoint
ALTER TABLE "rule_candidates" ADD CONSTRAINT "rule_candidates_plan_feedback_id_plan_feedback_id_fk" FOREIGN KEY ("plan_feedback_id") REFERENCES "public"."plan_feedback"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN "package";--> statement-breakpoint
ALTER TABLE "ai_calls" ADD CONSTRAINT "ai_calls_purpose_check" CHECK ("ai_calls"."purpose" in ('spec', 'writer', 'critic', 'check', 'rules', 'derivative', 'facts', 'plan'));--> statement-breakpoint
ALTER TABLE "rule_candidates" ADD CONSTRAINT "rule_candidates_source_check" CHECK ((case when "rule_candidates"."review_event_id" is null then 0 else 1 end) + (case when "rule_candidates"."derivative_id" is null then 0 else 1 end) + (case when "rule_candidates"."plan_feedback_id" is null then 0 else 1 end) = 1);--> statement-breakpoint
-- Hand-written (orientation amendment, Q5): Migss's projects start with four categories. "Other" is every project's
-- last category in code, never stored. Other projects start with none and add their own on Details.
INSERT INTO "project_categories" ("project_id", "label", "position")
SELECT p."id", c."label", c."position"
FROM "projects" p
JOIN "clients" cl ON cl."id" = p."client_id"
CROSS JOIN (VALUES ('Finance', 0), ('Guarantee', 1), ('Cost', 2), ('Technical', 3)) AS c("label", "position")
WHERE cl."name" ILIKE 'migss%'
ON CONFLICT DO NOTHING;
