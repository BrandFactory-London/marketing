ALTER TABLE "derivatives" DROP CONSTRAINT "derivatives_channel_check";--> statement-breakpoint
ALTER TABLE "rule_candidates" ALTER COLUMN "review_event_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "derivatives" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "rule_candidates" ADD COLUMN "derivative_id" uuid;--> statement-breakpoint
ALTER TABLE "rule_candidates" ADD COLUMN "scope" text DEFAULT 'all' NOT NULL;--> statement-breakpoint
ALTER TABLE "rule_candidates" ADD CONSTRAINT "rule_candidates_derivative_id_derivatives_id_fk" FOREIGN KEY ("derivative_id") REFERENCES "public"."derivatives"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "derivatives" ADD CONSTRAINT "derivatives_channel_check" CHECK ("derivatives"."channel" in ('gmb', 'linkedin', 'facebook', 'pinterest'));--> statement-breakpoint
ALTER TABLE "rule_candidates" ADD CONSTRAINT "rule_candidates_scope_check" CHECK ("rule_candidates"."scope" in ('all', 'blog', 'gmb', 'linkedin', 'facebook', 'pinterest'));--> statement-breakpoint
ALTER TABLE "rule_candidates" ADD CONSTRAINT "rule_candidates_source_check" CHECK (("rule_candidates"."review_event_id" is null) <> ("rule_candidates"."derivative_id" is null));