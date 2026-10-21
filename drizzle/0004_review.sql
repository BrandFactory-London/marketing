CREATE TABLE "post_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"generation_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"title" text NOT NULL,
	"excerpt" text,
	"body_md" text NOT NULL,
	"word_count" integer NOT NULL,
	"checks" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "post_versions_post_version_unique" UNIQUE("post_id","version"),
	CONSTRAINT "post_versions_version_check" CHECK ("post_versions"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "review_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"action" text NOT NULL,
	"note" text,
	"version_id" uuid,
	"draft_id" uuid,
	"diff" jsonb,
	"warnings" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_events_action_check" CHECK ("review_events"."action" in ('approve', 'reject', 'regenerate', 'reopen'))
);
--> statement-breakpoint
CREATE TABLE "rule_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"review_event_id" uuid NOT NULL,
	"post_id" uuid NOT NULL,
	"tier" text NOT NULL,
	"section" text NOT NULL,
	"text" text NOT NULL,
	"before" text,
	"after" text,
	"reason" text,
	"status" text DEFAULT 'proposed' NOT NULL,
	"knowledge_version_id" uuid,
	"ai_call_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	CONSTRAINT "rule_candidates_tier_check" CHECK ("rule_candidates"."tier" in ('agency', 'client', 'project')),
	CONSTRAINT "rule_candidates_status_check" CHECK ("rule_candidates"."status" in ('proposed', 'accepted', 'dismissed'))
);
--> statement-breakpoint
ALTER TABLE "ai_calls" DROP CONSTRAINT "ai_calls_purpose_check";--> statement-breakpoint
ALTER TABLE "critic_verdicts" ADD COLUMN "placeholders" jsonb;--> statement-breakpoint
ALTER TABLE "post_generations" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "post_generations" ADD COLUMN "base_version_id" uuid;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "slug" text;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "cover_drive_file_id" text;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "cover_name" text;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "cover_path" text;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "cover_chosen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "approved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "post_versions" ADD CONSTRAINT "post_versions_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_versions" ADD CONSTRAINT "post_versions_generation_id_post_generations_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."post_generations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_events" ADD CONSTRAINT "review_events_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_events" ADD CONSTRAINT "review_events_version_id_post_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."post_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_events" ADD CONSTRAINT "review_events_draft_id_post_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."post_drafts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rule_candidates" ADD CONSTRAINT "rule_candidates_review_event_id_review_events_id_fk" FOREIGN KEY ("review_event_id") REFERENCES "public"."review_events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rule_candidates" ADD CONSTRAINT "rule_candidates_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rule_candidates" ADD CONSTRAINT "rule_candidates_knowledge_version_id_knowledge_versions_id_fk" FOREIGN KEY ("knowledge_version_id") REFERENCES "public"."knowledge_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rule_candidates" ADD CONSTRAINT "rule_candidates_ai_call_id_ai_calls_id_fk" FOREIGN KEY ("ai_call_id") REFERENCES "public"."ai_calls"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "review_events_post_id_idx" ON "review_events" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "rule_candidates_status_idx" ON "rule_candidates" USING btree ("status");--> statement-breakpoint
ALTER TABLE "post_generations" ADD CONSTRAINT "post_generations_base_version_id_post_versions_id_fk" FOREIGN KEY ("base_version_id") REFERENCES "public"."post_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "posts_project_slug_unique" ON "posts" USING btree ("project_id","slug") WHERE "posts"."slug" is not null;--> statement-breakpoint
ALTER TABLE "ai_calls" ADD CONSTRAINT "ai_calls_purpose_check" CHECK ("ai_calls"."purpose" in ('spec', 'writer', 'critic', 'check', 'rules'));--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_slug_check" CHECK ("posts"."slug" is null or ("posts"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length("posts"."slug") <= 80));