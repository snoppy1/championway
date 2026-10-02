CREATE TABLE "consultation_confirm_tokens" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"consultation_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "consultations" DROP CONSTRAINT "consultations_status_check";--> statement-breakpoint
DROP INDEX "consultations_open_key";--> statement-breakpoint
ALTER TABLE "consultations" ADD COLUMN "reminded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "consultation_confirm_tokens" ADD CONSTRAINT "consultation_confirm_tokens_consultation_id_consultations_id_fk" FOREIGN KEY ("consultation_id") REFERENCES "public"."consultations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "consultation_confirm_tokens_consultation_idx" ON "consultation_confirm_tokens" USING btree ("consultation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "consultations_open_key" ON "consultations" USING btree ("user_id","mentor_id") WHERE status in ('contacted', 'claimed', 'requested', 'accepted', 'paid');--> statement-breakpoint
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_status_check" CHECK (status in ('contacted', 'claimed', 'denied', 'requested', 'accepted', 'paid', 'declined', 'cancelled', 'completed'));