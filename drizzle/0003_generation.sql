CREATE TABLE "ai_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid,
	"post_id" uuid,
	"purpose" text NOT NULL,
	"requested_model" text NOT NULL,
	"served_model" text,
	"prompt_version" text NOT NULL,
	"effort" text,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cache_write_tokens" integer DEFAULT 0 NOT NULL,
	"cache_read_tokens" integer DEFAULT 0 NOT NULL,
	"cost_usd" numeric(12, 6) DEFAULT 0 NOT NULL,
	"duration_ms" integer DEFAULT 0 NOT NULL,
	"stop_reason" text,
	"request_id" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_calls_purpose_check" CHECK ("ai_calls"."purpose" in ('spec', 'writer', 'critic', 'check'))
);
--> statement-breakpoint
CREATE TABLE "batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"length_min" integer NOT NULL,
	"length_max" integer NOT NULL,
	"cta" text NOT NULL,
	"faq_mode" text NOT NULL,
	"default_pillar_id" uuid,
	"notes" text,
	"writer_model" text NOT NULL,
	"critic_model" text NOT NULL,
	"derivative_model" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "batches_length_check" CHECK ("batches"."length_min" > 0 and "batches"."length_max" >= "batches"."length_min"),
	CONSTRAINT "batches_faq_mode_check" CHECK ("batches"."faq_mode" in ('useful', 'always', 'never'))
);
--> statement-breakpoint
CREATE TABLE "critic_verdicts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"draft_id" uuid NOT NULL,
	"verdict" text NOT NULL,
	"summary" text,
	"issues" jsonb NOT NULL,
	"scores" jsonb NOT NULL,
	"ai_call_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "critic_verdicts_draft_unique" UNIQUE("draft_id"),
	CONSTRAINT "critic_verdicts_verdict_check" CHECK ("critic_verdicts"."verdict" in ('pass', 'fail'))
);
--> statement-breakpoint
CREATE TABLE "post_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"generation_id" uuid NOT NULL,
	"round" integer NOT NULL,
	"title" text NOT NULL,
	"excerpt" text,
	"body_md" text NOT NULL,
	"word_count" integer NOT NULL,
	"checks" jsonb NOT NULL,
	"checks_passed" boolean NOT NULL,
	"ai_call_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "post_drafts_generation_round_unique" UNIQUE("generation_id","round"),
	CONSTRAINT "post_drafts_round_check" CHECK ("post_drafts"."round" between 1 and 3)
);
--> statement-breakpoint
CREATE TABLE "post_generations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"spec_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"trigger_run_id" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"round" integer DEFAULT 0 NOT NULL,
	"error" text,
	"agency_version_id" uuid,
	"client_version_id" uuid,
	"project_version_id" uuid,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "post_generations_status_check" CHECK ("post_generations"."status" in ('queued', 'running', 'in_review', 'flagged', 'failed')),
	CONSTRAINT "post_generations_round_check" CHECK ("post_generations"."round" between 0 and 3)
);
--> statement-breakpoint
CREATE TABLE "post_specs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"status" text NOT NULL,
	"keyword" text,
	"post_type" text,
	"location" text,
	"angle" text,
	"outline" jsonb,
	"facts" jsonb,
	"links" jsonb,
	"length_min" integer NOT NULL,
	"length_max" integer NOT NULL,
	"cta" text NOT NULL,
	"faq" boolean,
	"notes" text,
	"redraft_note" text,
	"error" text,
	"agency_version_id" uuid,
	"client_version_id" uuid,
	"project_version_id" uuid,
	"ai_call_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone,
	CONSTRAINT "post_specs_post_version_unique" UNIQUE("post_id","version"),
	CONSTRAINT "post_specs_status_check" CHECK ("post_specs"."status" in ('drafting', 'proposed', 'confirmed', 'superseded', 'failed')),
	CONSTRAINT "post_specs_length_check" CHECK ("post_specs"."length_min" > 0 and "post_specs"."length_max" >= "post_specs"."length_min")
);
--> statement-breakpoint
CREATE TABLE "project_pillars" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"label" text NOT NULL,
	"slug" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_pillars_project_slug_unique" UNIQUE("project_id","slug"),
	CONSTRAINT "project_pillars_slug_check" CHECK ("project_pillars"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);
--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "batch_id" uuid;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "pillar_id" uuid;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "generation_step" text;--> statement-breakpoint
ALTER TABLE "ai_calls" ADD CONSTRAINT "ai_calls_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_calls" ADD CONSTRAINT "ai_calls_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_default_pillar_id_project_pillars_id_fk" FOREIGN KEY ("default_pillar_id") REFERENCES "public"."project_pillars"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "critic_verdicts" ADD CONSTRAINT "critic_verdicts_draft_id_post_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."post_drafts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "critic_verdicts" ADD CONSTRAINT "critic_verdicts_ai_call_id_ai_calls_id_fk" FOREIGN KEY ("ai_call_id") REFERENCES "public"."ai_calls"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_drafts" ADD CONSTRAINT "post_drafts_generation_id_post_generations_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."post_generations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_drafts" ADD CONSTRAINT "post_drafts_ai_call_id_ai_calls_id_fk" FOREIGN KEY ("ai_call_id") REFERENCES "public"."ai_calls"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_generations" ADD CONSTRAINT "post_generations_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_generations" ADD CONSTRAINT "post_generations_spec_id_post_specs_id_fk" FOREIGN KEY ("spec_id") REFERENCES "public"."post_specs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_generations" ADD CONSTRAINT "post_generations_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_generations" ADD CONSTRAINT "post_generations_agency_version_id_knowledge_versions_id_fk" FOREIGN KEY ("agency_version_id") REFERENCES "public"."knowledge_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_generations" ADD CONSTRAINT "post_generations_client_version_id_knowledge_versions_id_fk" FOREIGN KEY ("client_version_id") REFERENCES "public"."knowledge_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_generations" ADD CONSTRAINT "post_generations_project_version_id_knowledge_versions_id_fk" FOREIGN KEY ("project_version_id") REFERENCES "public"."knowledge_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_specs" ADD CONSTRAINT "post_specs_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_specs" ADD CONSTRAINT "post_specs_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_specs" ADD CONSTRAINT "post_specs_agency_version_id_knowledge_versions_id_fk" FOREIGN KEY ("agency_version_id") REFERENCES "public"."knowledge_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_specs" ADD CONSTRAINT "post_specs_client_version_id_knowledge_versions_id_fk" FOREIGN KEY ("client_version_id") REFERENCES "public"."knowledge_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_specs" ADD CONSTRAINT "post_specs_project_version_id_knowledge_versions_id_fk" FOREIGN KEY ("project_version_id") REFERENCES "public"."knowledge_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_specs" ADD CONSTRAINT "post_specs_ai_call_id_ai_calls_id_fk" FOREIGN KEY ("ai_call_id") REFERENCES "public"."ai_calls"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_pillars" ADD CONSTRAINT "project_pillars_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_calls_post_id_idx" ON "ai_calls" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "ai_calls_batch_id_idx" ON "ai_calls" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "batches_project_id_idx" ON "batches" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "post_generations_post_id_idx" ON "post_generations" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "post_generations_batch_id_idx" ON "post_generations" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "post_specs_batch_id_idx" ON "post_specs" USING btree ("batch_id");--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_pillar_id_project_pillars_id_fk" FOREIGN KEY ("pillar_id") REFERENCES "public"."project_pillars"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "posts_batch_id_idx" ON "posts" USING btree ("batch_id");--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_generation_step_check" CHECK ("posts"."generation_step" is null or "posts"."generation_step" in ('writer', 'critic'));