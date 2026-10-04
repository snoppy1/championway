CREATE TABLE "staff_notifications" (
	"kind" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"audience" text DEFAULT 'all' NOT NULL,
	"recipient_ids" text[] DEFAULT '{}' NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_notifications_audience_check" CHECK ("staff_notifications"."audience" in ('all', 'selected'))
);
--> statement-breakpoint
ALTER TABLE "staff_notifications" ADD CONSTRAINT "staff_notifications_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;