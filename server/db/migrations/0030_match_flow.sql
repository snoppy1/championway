CREATE TABLE "learner_profiles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"level" text NOT NULL,
	"interests_fields" text[] DEFAULT '{}' NOT NULL,
	"skills" text[] DEFAULT '{}' NOT NULL,
	"languages" text[] DEFAULT '{}' NOT NULL,
	"country" text DEFAULT 'TH' NOT NULL,
	"interests" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "learner_profiles_level_check" CHECK (level in ('beginner', 'intermediate', 'advanced'))
);
--> statement-breakpoint
CREATE TABLE "match_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"user_id" text NOT NULL,
	"answers" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "match_results" (
	"request_id" text NOT NULL,
	"mentor_id" text NOT NULL,
	"rank" integer NOT NULL,
	"score" integer NOT NULL,
	"parts" jsonb NOT NULL,
	"reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"version" text NOT NULL,
	CONSTRAINT "match_results_request_id_mentor_id_pk" PRIMARY KEY("request_id","mentor_id")
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"start" text NOT NULL,
	"competition_kind" text,
	"competition_id" text,
	"competition_name" text DEFAULT '' NOT NULL,
	"stage" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_start_check" CHECK (start in ('has_competition', 'has_idea', 'build_skills')),
	CONSTRAINT "projects_stage_check" CHECK (stage in ('idea', 'planning', 'prototype', 'improving', 'pitching')),
	CONSTRAINT "projects_kind_check" CHECK (competition_kind is null or competition_kind in ('hackathon', 'case'))
);
--> statement-breakpoint
ALTER TABLE "consultations" ADD COLUMN "match_request_id" text;--> statement-breakpoint
ALTER TABLE "learner_profiles" ADD CONSTRAINT "learner_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_requests" ADD CONSTRAINT "match_requests_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_requests" ADD CONSTRAINT "match_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_results" ADD CONSTRAINT "match_results_request_id_match_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."match_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_results" ADD CONSTRAINT "match_results_mentor_id_mentors_id_fk" FOREIGN KEY ("mentor_id") REFERENCES "public"."mentors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_competition_id_competitions_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "match_requests_user_idx" ON "match_requests" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "match_requests_project_idx" ON "match_requests" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "match_results_request_idx" ON "match_results" USING btree ("request_id","rank");--> statement-breakpoint
CREATE INDEX "projects_user_idx" ON "projects" USING btree ("user_id","updated_at");--> statement-breakpoint
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_match_request_id_match_requests_id_fk" FOREIGN KEY ("match_request_id") REFERENCES "public"."match_requests"("id") ON DELETE set null ON UPDATE no action;