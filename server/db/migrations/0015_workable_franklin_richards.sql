ALTER TABLE "competition_requests" ALTER COLUMN "minutes" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "competition_requests" ADD COLUMN "unit" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "competition_requests" ADD COLUMN "result" text;--> statement-breakpoint
ALTER TABLE "competition_requests" ADD COLUMN "year" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "competition_requests" ADD COLUMN "evidence" text DEFAULT '' NOT NULL;