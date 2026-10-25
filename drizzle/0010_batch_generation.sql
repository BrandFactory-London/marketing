CREATE TABLE "generation_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"round" integer NOT NULL,
	"anthropic_batch_id" text,
	"request_count" integer NOT NULL,
	"requests" jsonb NOT NULL,
	"status" text DEFAULT 'submitted' NOT NULL,
	"error" text,
	"submitted_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "generation_batches_anthropic_unique" UNIQUE("anthropic_batch_id"),
	CONSTRAINT "generation_batches_round_unique" UNIQUE("batch_id","round"),
	CONSTRAINT "generation_batches_status_check" CHECK ("generation_batches"."status" in ('submitted', 'ended', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "ai_calls" ADD COLUMN "batch" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "batches" ADD COLUMN "run_id" uuid;--> statement-breakpoint
ALTER TABLE "post_specs" ADD COLUMN "auto" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "auto_generate" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "next_generation_on" date;--> statement-breakpoint
ALTER TABLE "generation_batches" ADD CONSTRAINT "generation_batches_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_batches" ADD CONSTRAINT "generation_batches_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "generation_batches_run_id_idx" ON "generation_batches" USING btree ("run_id");--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE restrict ON UPDATE no action;