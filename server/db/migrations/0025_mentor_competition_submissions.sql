ALTER TABLE "competition_submissions" ADD COLUMN "mentor_id" text;--> statement-breakpoint
ALTER TABLE "competition_submissions" ADD COLUMN "mentor_result" text;--> statement-breakpoint
ALTER TABLE "competition_submissions" ADD COLUMN "mentor_year" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "competition_submissions" ADD COLUMN "mentor_price" integer;--> statement-breakpoint
ALTER TABLE "competition_submissions" ADD COLUMN "mentor_unit" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "competition_submissions" ADD CONSTRAINT "competition_submissions_mentor_id_mentors_id_fk" FOREIGN KEY ("mentor_id") REFERENCES "public"."mentors"("id") ON DELETE set null ON UPDATE no action;