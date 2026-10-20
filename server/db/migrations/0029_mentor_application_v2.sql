ALTER TABLE "mentor_awards" DROP CONSTRAINT "mentor_awards_result_check";--> statement-breakpoint
ALTER TABLE "mentor_awards" ADD COLUMN "kind" text DEFAULT 'hackathon' NOT NULL;--> statement-breakpoint
ALTER TABLE "mentor_awards" ADD COLUMN "role" text DEFAULT 'other' NOT NULL;--> statement-breakpoint
ALTER TABLE "mentor_awards" ADD COLUMN "role_other" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "mentor_awards" ADD COLUMN "responsibility" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "mentor_awards" ADD COLUMN "lessons" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "mentor_submissions" ADD COLUMN "profile" jsonb;--> statement-breakpoint
ALTER TABLE "mentor_submissions" ADD COLUMN "price_unit" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "mentor_awards" ADD CONSTRAINT "mentor_awards_result_check" CHECK ("mentor_awards"."result" in ('winner', 'finalist', 'participant', 'other'));