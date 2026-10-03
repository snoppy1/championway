CREATE TABLE "billing_customers" (
	"user_id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rising_star_subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"mentor_id" text NOT NULL,
	"status" text NOT NULL,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"event_created" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stripe_events" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rising_star_periods" ADD COLUMN "reminded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "billing_customers" ADD CONSTRAINT "billing_customers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rising_star_subscriptions" ADD CONSTRAINT "rising_star_subscriptions_mentor_id_mentors_id_fk" FOREIGN KEY ("mentor_id") REFERENCES "public"."mentors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "billing_customers_customer_key" ON "billing_customers" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "rising_star_subscriptions_mentor_idx" ON "rising_star_subscriptions" USING btree ("mentor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rising_star_periods_external_key" ON "rising_star_periods" USING btree ("external_id") WHERE "rising_star_periods"."external_id" is not null;