CREATE TABLE "derivatives" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"version" integer NOT NULL,
	"status" text NOT NULL,
	"source" text NOT NULL,
	"body" text,
	"checks" jsonb,
	"note" text,
	"error" text,
	"trigger_run_id" text,
	"ai_call_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "derivatives_post_channel_version_unique" UNIQUE("post_id","channel","version"),
	CONSTRAINT "derivatives_channel_check" CHECK ("derivatives"."channel" in ('gmb', 'linkedin')),
	CONSTRAINT "derivatives_status_check" CHECK ("derivatives"."status" in ('writing', 'ready', 'failed')),
	CONSTRAINT "derivatives_source_check" CHECK ("derivatives"."source" in ('model', 'edit')),
	CONSTRAINT "derivatives_version_check" CHECK ("derivatives"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "post_publications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"target" text DEFAULT 'wix_blog' NOT NULL,
	"state" text NOT NULL,
	"step" text,
	"cover_drive_file_id" text,
	"wix_file_id" text,
	"wix_tag_id" text,
	"wix_draft_id" text,
	"wix_post_id" text,
	"wix_slug" text,
	"live_url" text,
	"error" text,
	"trigger_run_id" text,
	"heartbeat_at" timestamp with time zone,
	"check_started_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "post_publications_post_unique" UNIQUE("post_id"),
	CONSTRAINT "post_publications_target_check" CHECK ("post_publications"."target" in ('wix_blog')),
	CONSTRAINT "post_publications_state_check" CHECK ("post_publications"."state" in ('running', 'failed', 'checking', 'live', 'not_confirmed')),
	CONSTRAINT "post_publications_step_check" CHECK ("post_publications"."step" is null or "post_publications"."step" in ('cover', 'tag', 'draft', 'publish', 'live'))
);
--> statement-breakpoint
CREATE TABLE "project_wix" (
	"project_id" uuid PRIMARY KEY NOT NULL,
	"credentials_enc" text NOT NULL,
	"key_hint" text NOT NULL,
	"member_id" text,
	"member_name" text,
	"checked_at" timestamp with time zone,
	"check_ok" boolean,
	"check_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "publish_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"publication_id" uuid NOT NULL,
	"step" text NOT NULL,
	"result" text NOT NULL,
	"http_status" integer,
	"message" text,
	"request_id" text,
	"details" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "publish_events_step_check" CHECK ("publish_events"."step" in ('cover', 'tag', 'draft', 'publish', 'live')),
	CONSTRAINT "publish_events_result_check" CHECK ("publish_events"."result" in ('ok', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "ai_calls" DROP CONSTRAINT "ai_calls_purpose_check";--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "published_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "live_url" text;--> statement-breakpoint
ALTER TABLE "rule_candidates" ADD COLUMN "kind" text DEFAULT 'rule' NOT NULL;--> statement-breakpoint
ALTER TABLE "derivatives" ADD CONSTRAINT "derivatives_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "derivatives" ADD CONSTRAINT "derivatives_ai_call_id_ai_calls_id_fk" FOREIGN KEY ("ai_call_id") REFERENCES "public"."ai_calls"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_publications" ADD CONSTRAINT "post_publications_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_wix" ADD CONSTRAINT "project_wix_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publish_events" ADD CONSTRAINT "publish_events_publication_id_post_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."post_publications"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "publish_events_publication_id_idx" ON "publish_events" USING btree ("publication_id");--> statement-breakpoint
ALTER TABLE "ai_calls" ADD CONSTRAINT "ai_calls_purpose_check" CHECK ("ai_calls"."purpose" in ('spec', 'writer', 'critic', 'check', 'rules', 'derivative', 'facts'));--> statement-breakpoint
ALTER TABLE "rule_candidates" ADD CONSTRAINT "rule_candidates_kind_check" CHECK ("rule_candidates"."kind" in ('rule', 'fact'));