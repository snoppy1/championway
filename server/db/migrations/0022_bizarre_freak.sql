ALTER TABLE "competition_submissions" ADD COLUMN "opens_precision" text DEFAULT 'day' NOT NULL;--> statement-breakpoint
ALTER TABLE "competition_submissions" ADD COLUMN "closes_precision" text DEFAULT 'day' NOT NULL;--> statement-breakpoint
ALTER TABLE "competitions" ADD COLUMN "opens_precision" text DEFAULT 'day' NOT NULL;--> statement-breakpoint
ALTER TABLE "competitions" ADD COLUMN "closes_precision" text DEFAULT 'day' NOT NULL;--> statement-breakpoint
ALTER TABLE "mentor_awards" ADD COLUMN "evidence_file_id" text;--> statement-breakpoint
ALTER TABLE "mentor_awards" ADD COLUMN "offer_price" integer;--> statement-breakpoint
ALTER TABLE "mentor_awards" ADD COLUMN "offer_unit" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "mentor_submissions" ADD COLUMN "photo_file_id" text;--> statement-breakpoint
ALTER TABLE "mentors" ADD COLUMN "photo_url" text;--> statement-breakpoint
ALTER TABLE "mentor_awards" ADD CONSTRAINT "mentor_awards_evidence_file_id_files_id_fk" FOREIGN KEY ("evidence_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentor_submissions" ADD CONSTRAINT "mentor_submissions_photo_file_id_files_id_fk" FOREIGN KEY ("photo_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;