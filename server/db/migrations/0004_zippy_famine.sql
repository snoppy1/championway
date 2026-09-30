CREATE TABLE "rising_star_periods" (
	"id" text PRIMARY KEY NOT NULL,
	"mentor_id" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"source" text NOT NULL,
	"external_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rising_star_periods" ADD CONSTRAINT "rising_star_periods_mentor_id_mentors_id_fk" FOREIGN KEY ("mentor_id") REFERENCES "public"."mentors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rising_star_periods_mentor_idx" ON "rising_star_periods" USING btree ("mentor_id","ends_at");