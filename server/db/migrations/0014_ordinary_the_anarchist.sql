CREATE TABLE "mentor_experiences" (
	"id" text PRIMARY KEY NOT NULL,
	"mentor_id" text NOT NULL,
	"competition_id" text,
	"name" text NOT NULL,
	"result" text NOT NULL,
	"year" text NOT NULL,
	"detail" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mentor_awards" ADD COLUMN "result" text DEFAULT 'winner' NOT NULL;--> statement-breakpoint
ALTER TABLE "mentor_awards" ADD COLUMN "detail" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "mentor_awards" ADD COLUMN "wants_mentor" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "mentor_competition_choices" ADD COLUMN "unit" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "mentors" ADD COLUMN "price_unit" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "mentor_experiences" ADD CONSTRAINT "mentor_experiences_mentor_id_mentors_id_fk" FOREIGN KEY ("mentor_id") REFERENCES "public"."mentors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentor_experiences" ADD CONSTRAINT "mentor_experiences_competition_id_competitions_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mentor_experiences_mentor_idx" ON "mentor_experiences" USING btree ("mentor_id");--> statement-breakpoint
CREATE INDEX "mentor_experiences_competition_idx" ON "mentor_experiences" USING btree ("competition_id");--> statement-breakpoint
ALTER TABLE "mentor_awards" ADD CONSTRAINT "mentor_awards_result_check" CHECK ("mentor_awards"."result" in ('winner', 'finalist', 'participant'));