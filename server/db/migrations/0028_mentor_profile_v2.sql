CREATE TABLE "hackathon_names" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"normalized" text NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mentor_skills" (
	"mentor_id" text NOT NULL,
	"tag" text NOT NULL,
	"level" text NOT NULL,
	CONSTRAINT "mentor_skills_mentor_id_tag_pk" PRIMARY KEY("mentor_id","tag"),
	CONSTRAINT "mentor_skills_level_check" CHECK ("mentor_skills"."level" in ('intermediate', 'advanced', 'expert'))
);
--> statement-breakpoint
ALTER TABLE "mentor_experiences" ADD COLUMN "hackathon_name_id" text;--> statement-breakpoint
ALTER TABLE "mentor_experiences" ADD COLUMN "kind" text DEFAULT 'hackathon' NOT NULL;--> statement-breakpoint
ALTER TABLE "mentor_experiences" ADD COLUMN "role" text DEFAULT 'other' NOT NULL;--> statement-breakpoint
ALTER TABLE "mentor_experiences" ADD COLUMN "role_other" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "mentor_experiences" ADD COLUMN "responsibility" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "mentor_experiences" ADD COLUMN "evidence_url" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "mentor_experiences" ADD COLUMN "lessons" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "mentor_experiences" ADD COLUMN "status" text DEFAULT 'verified' NOT NULL;--> statement-breakpoint
ALTER TABLE "mentor_experiences" ADD COLUMN "reviewed_by" text;--> statement-breakpoint
ALTER TABLE "mentor_experiences" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "mentor_experiences" ADD COLUMN "reason" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "mentors" ADD COLUMN "headline" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "mentors" ADD COLUMN "country" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "mentors" ADD COLUMN "time_zone" text DEFAULT 'Asia/Bangkok' NOT NULL;--> statement-breakpoint
ALTER TABLE "mentors" ADD COLUMN "languages" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "mentors" ADD COLUMN "background" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "mentors" ADD COLUMN "gender" text;--> statement-breakpoint
ALTER TABLE "mentors" ADD COLUMN "helps_with" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "mentors" ADD COLUMN "learner_levels" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "mentors" ADD COLUMN "teaching_styles" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "mentors" ADD COLUMN "formats" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "mentors" ADD COLUMN "deliverables" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "mentors" ADD COLUMN "availability" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "mentors" ADD COLUMN "sessions_per_week" integer;--> statement-breakpoint
ALTER TABLE "mentors" ADD COLUMN "session_minutes" integer[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "mentors" ADD COLUMN "accepting_requests" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "mentors" ADD COLUMN "reply_hours" integer;--> statement-breakpoint
ALTER TABLE "mentors" ADD COLUMN "accepts_urgent" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "mentors" ADD COLUMN "mode" text;--> statement-breakpoint
ALTER TABLE "hackathon_names" ADD CONSTRAINT "hackathon_names_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentor_skills" ADD CONSTRAINT "mentor_skills_mentor_id_mentors_id_fk" FOREIGN KEY ("mentor_id") REFERENCES "public"."mentors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "hackathon_names_normalized_key" ON "hackathon_names" USING btree ("normalized");--> statement-breakpoint
ALTER TABLE "mentor_experiences" ADD CONSTRAINT "mentor_experiences_hackathon_name_id_hackathon_names_id_fk" FOREIGN KEY ("hackathon_name_id") REFERENCES "public"."hackathon_names"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentor_experiences" ADD CONSTRAINT "mentor_experiences_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mentor_experiences_status_idx" ON "mentor_experiences" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "mentor_experiences_name_once_key" ON "mentor_experiences" USING btree ("mentor_id","hackathon_name_id","year") WHERE "mentor_experiences"."hackathon_name_id" is not null;--> statement-breakpoint
ALTER TABLE "mentor_experiences" ADD CONSTRAINT "mentor_experiences_status_check" CHECK ("mentor_experiences"."status" in ('pending', 'verified', 'rejected'));