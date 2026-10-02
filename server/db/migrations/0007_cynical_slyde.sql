CREATE TABLE "hire_payments" (
	"id" text PRIMARY KEY NOT NULL,
	"hire_id" text NOT NULL,
	"provider" text NOT NULL,
	"provider_ref" text,
	"amount" integer NOT NULL,
	"currency" text DEFAULT 'thb' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone,
	"refunded_at" timestamp with time zone,
	CONSTRAINT "hire_payments_status_check" CHECK (status in ('pending', 'paid', 'failed', 'refunded'))
);
--> statement-breakpoint
CREATE TABLE "mentor_payout_accounts" (
	"mentor_id" text PRIMARY KEY NOT NULL,
	"account_name" text NOT NULL,
	"bank_code" text NOT NULL,
	"account_number_encrypted" text NOT NULL,
	"account_last4" text NOT NULL,
	"provider_recipient_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mentor_payout_accounts_status_check" CHECK (status in ('pending', 'verified', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "mentor_payouts" (
	"id" text PRIMARY KEY NOT NULL,
	"hire_id" text NOT NULL,
	"mentor_id" text NOT NULL,
	"amount" integer NOT NULL,
	"status" text DEFAULT 'due' NOT NULL,
	"method" text,
	"provider_ref" text,
	"note" text DEFAULT '' NOT NULL,
	"decided_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone,
	CONSTRAINT "mentor_payouts_status_check" CHECK (status in ('due', 'held', 'paid', 'cancelled'))
);
--> statement-breakpoint
ALTER TABLE "consultations" DROP CONSTRAINT "consultations_status_check";--> statement-breakpoint
DROP INDEX "consultations_open_key";--> statement-breakpoint
ALTER TABLE "consultations" ADD COLUMN "paid_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "consultations" ADD COLUMN "disputed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "consultations" ADD COLUMN "dispute_reason" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "hire_payments" ADD CONSTRAINT "hire_payments_hire_id_consultations_id_fk" FOREIGN KEY ("hire_id") REFERENCES "public"."consultations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentor_payout_accounts" ADD CONSTRAINT "mentor_payout_accounts_mentor_id_mentors_id_fk" FOREIGN KEY ("mentor_id") REFERENCES "public"."mentors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentor_payouts" ADD CONSTRAINT "mentor_payouts_hire_id_consultations_id_fk" FOREIGN KEY ("hire_id") REFERENCES "public"."consultations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentor_payouts" ADD CONSTRAINT "mentor_payouts_mentor_id_mentors_id_fk" FOREIGN KEY ("mentor_id") REFERENCES "public"."mentors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentor_payouts" ADD CONSTRAINT "mentor_payouts_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "hire_payments_hire_idx" ON "hire_payments" USING btree ("hire_id");--> statement-breakpoint
CREATE UNIQUE INDEX "hire_payments_provider_ref_key" ON "hire_payments" USING btree ("provider","provider_ref");--> statement-breakpoint
CREATE UNIQUE INDEX "hire_payments_one_paid_key" ON "hire_payments" USING btree ("hire_id") WHERE status in ('paid', 'refunded');--> statement-breakpoint
CREATE UNIQUE INDEX "mentor_payouts_hire_key" ON "mentor_payouts" USING btree ("hire_id");--> statement-breakpoint
CREATE INDEX "mentor_payouts_status_idx" ON "mentor_payouts" USING btree ("status","created_at");--> statement-breakpoint
-- งานจากรอบก่อนมีระบบจ่ายเงิน ที่เมนเทอร์รับแล้วแชตเปิดอยู่แล้ว ถือว่าเริ่มงานแล้ว (paid) แชตจะได้ไม่ถูกล็อก
-- ไม่มีแถว hire_payments จึงไม่มียอดโอนให้เมนเทอร์เกิดขึ้นจากงานพวกนี้
UPDATE "consultations" SET "status" = 'paid', "paid_at" = coalesce("accepted_at", "created_at") WHERE "status" = 'accepted';--> statement-breakpoint
CREATE UNIQUE INDEX "consultations_open_key" ON "consultations" USING btree ("user_id","mentor_id") WHERE status in ('requested', 'accepted', 'paid');--> statement-breakpoint
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_status_check" CHECK (status in ('requested', 'accepted', 'paid', 'declined', 'cancelled', 'completed'));