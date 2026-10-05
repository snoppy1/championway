CREATE TABLE "competition_import_sources" (
	"id" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"last_run_at" timestamp with time zone,
	"last_error" text,
	"last_found" integer DEFAULT 0 NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "competition_imports" (
	"id" text PRIMARY KEY NOT NULL,
	"origin" text NOT NULL,
	"url" text,
	"title" text NOT NULL,
	"status" text DEFAULT 'processing' NOT NULL,
	"item_kind" text,
	"draft" jsonb,
	"uncertain" text[] DEFAULT '{}' NOT NULL,
	"note" text,
	"error" text,
	"duplicate_of" text,
	"competition_id" text,
	"reject_reason" text,
	"created_by" text,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "competition_imports_status_check" CHECK ("competition_imports"."status" in ('processing', 'pending', 'skipped', 'accepted', 'rejected', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "competition_import_sources" ADD CONSTRAINT "competition_import_sources_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_imports" ADD CONSTRAINT "competition_imports_duplicate_of_competitions_id_fk" FOREIGN KEY ("duplicate_of") REFERENCES "public"."competitions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_imports" ADD CONSTRAINT "competition_imports_competition_id_competitions_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_imports" ADD CONSTRAINT "competition_imports_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_imports" ADD CONSTRAINT "competition_imports_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "competition_imports_url_idx" ON "competition_imports" USING btree ("url");--> statement-breakpoint
CREATE INDEX "competition_imports_status_idx" ON "competition_imports" USING btree ("status","created_at");