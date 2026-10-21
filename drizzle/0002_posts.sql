CREATE TABLE "posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"status" text DEFAULT 'planned' NOT NULL,
	"status_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cadence_date" date,
	"slot_date" date NOT NULL,
	"topic" text,
	"topic_set_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "posts_project_cadence_unique" UNIQUE("project_id","cadence_date"),
	CONSTRAINT "posts_status_check" CHECK ("posts"."status" in ('planned', 'topic_set', 'spec_confirmed', 'generating', 'in_review', 'approved', 'published', 'flagged', 'rejected')),
	CONSTRAINT "posts_topic_check" CHECK (("posts"."status" = 'planned') = ("posts"."topic" is null))
);
--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "posts_slot_date_idx" ON "posts" USING btree ("slot_date");--> statement-breakpoint
CREATE INDEX "posts_project_slot_date_idx" ON "posts" USING btree ("project_id","slot_date");