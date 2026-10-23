CREATE TABLE "calendar_deletions" (
	"post_id" uuid PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_calls" ADD COLUMN "unstored" jsonb;--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "calendar_user_id" text;--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "calendar_id" text;--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "calendar_name" text;--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "calendar_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "calendar_error" text;--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "calendar_error_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "short_name" text;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "calendar_hash" text;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "calendar_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "calendar_error" text;--> statement-breakpoint
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_calendar_user_id_users_id_fk" FOREIGN KEY ("calendar_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;