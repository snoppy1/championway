ALTER TABLE "mentor_awards" DROP CONSTRAINT "mentor_awards_evidence_file_id_files_id_fk";
--> statement-breakpoint
ALTER TABLE "mentor_awards" DROP COLUMN "evidence_file_id";