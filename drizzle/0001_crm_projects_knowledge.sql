CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"main_contact" text,
	"email" text,
	"phone" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tier" text NOT NULL,
	"client_id" uuid,
	"project_id" uuid,
	"version" integer NOT NULL,
	"sections" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_versions_owner_version_unique" UNIQUE NULLS NOT DISTINCT("tier","client_id","project_id","version"),
	CONSTRAINT "knowledge_versions_version_check" CHECK ("knowledge_versions"."version" >= 1),
	CONSTRAINT "knowledge_versions_owner_check" CHECK (("knowledge_versions"."tier" = 'agency' and "knowledge_versions"."client_id" is null and "knowledge_versions"."project_id" is null)
        or ("knowledge_versions"."tier" = 'client' and "knowledge_versions"."client_id" is not null and "knowledge_versions"."project_id" is null)
        or ("knowledge_versions"."tier" = 'project' and "knowledge_versions"."project_id" is not null and "knowledge_versions"."client_id" is null))
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"name" text NOT NULL,
	"site_url" text NOT NULL,
	"package" text NOT NULL,
	"status" text NOT NULL,
	"status_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"publishing_target" text DEFAULT 'wix_blog' NOT NULL,
	"drive_folder_id" text,
	"drive_folder_name" text,
	"drive_folder_checked_at" timestamp with time zone,
	"sitemap_imported_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_package_check" CHECK ("projects"."package" in ('entry', 'mid', 'premium')),
	CONSTRAINT "projects_status_check" CHECK ("projects"."status" in ('active', 'paused')),
	CONSTRAINT "projects_publishing_target_check" CHECK ("projects"."publishing_target" in ('wix_blog'))
);
--> statement-breakpoint
CREATE TABLE "site_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"url" text NOT NULL,
	"path" text NOT NULL,
	"title" text NOT NULL,
	"lastmod" timestamp with time zone,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_pages_project_url_unique" UNIQUE("project_id","url")
);
--> statement-breakpoint
ALTER TABLE "knowledge_versions" ADD CONSTRAINT "knowledge_versions_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_versions" ADD CONSTRAINT "knowledge_versions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_pages" ADD CONSTRAINT "site_pages_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "projects_client_id_idx" ON "projects" USING btree ("client_id");