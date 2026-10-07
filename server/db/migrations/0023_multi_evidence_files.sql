ALTER TABLE "mentor_awards" ADD COLUMN "evidence_file_ids" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
UPDATE "mentor_awards" SET "evidence_file_ids" = ARRAY["evidence_file_id"] WHERE "evidence_file_id" IS NOT NULL;
