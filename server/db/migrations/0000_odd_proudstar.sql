CREATE TYPE "public"."category" AS ENUM('writing', 'performing', 'film', 'education', 'academic', 'marketing', 'technology', 'design', 'health', 'society', 'environment', 'food', 'business');--> statement-breakpoint
CREATE TYPE "public"."decision" AS ENUM('publish', 'info', 'reject');--> statement-breakpoint
CREATE TYPE "public"."level" AS ENUM('primary', 'secondary', 'university', 'open');--> statement-breakpoint
CREATE TYPE "public"."opportunity_type" AS ENUM('contest', 'camp', 'workshop', 'scholarship', 'internship');--> statement-breakpoint
CREATE TYPE "public"."region" AS ENUM('online', 'bangkok', 'central', 'north', 'northeast', 'east', 'south');--> statement-breakpoint
CREATE TYPE "public"."reward" AS ENUM('certificate', 'trophy', 'publish', 'internship', 'partnership');--> statement-breakpoint
CREATE TYPE "public"."source" AS ENUM('editorial', 'organiser', 'partner');--> statement-breakpoint
CREATE TYPE "public"."submission_status" AS ENUM('pending', 'info', 'published', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."review_target" AS ENUM('competition', 'mentor');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('member', 'reviewer', 'admin');--> statement-breakpoint
CREATE TABLE "competition_categories" (
	"competition_id" text NOT NULL,
	"category" "category" NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "competition_categories_competition_id_category_pk" PRIMARY KEY("competition_id","category")
);
--> statement-breakpoint
CREATE TABLE "competition_levels" (
	"competition_id" text NOT NULL,
	"level" "level" NOT NULL,
	CONSTRAINT "competition_levels_competition_id_level_pk" PRIMARY KEY("competition_id","level")
);
--> statement-breakpoint
CREATE TABLE "competition_rewards" (
	"competition_id" text NOT NULL,
	"reward" "reward" NOT NULL,
	CONSTRAINT "competition_rewards_competition_id_reward_pk" PRIMARY KEY("competition_id","reward")
);
--> statement-breakpoint
CREATE TABLE "competition_submissions" (
	"id" text PRIMARY KEY NOT NULL,
	"status" "submission_status" DEFAULT 'pending' NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"organizer_name" text NOT NULL,
	"contact_name" text NOT NULL,
	"contact_role" text NOT NULL,
	"contact_email" text NOT NULL,
	"contact_phone" text NOT NULL,
	"organizer_url" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"type" "opportunity_type" NOT NULL,
	"team_min" integer NOT NULL,
	"team_max" integer NOT NULL,
	"opens_at" date,
	"closes_at" date NOT NULL,
	"event_date" date,
	"region" "region" NOT NULL,
	"venue" text,
	"prize_value" integer DEFAULT 0 NOT NULL,
	"prize_note" text,
	"fee" integer,
	"source_url" text NOT NULL,
	"register_url" text,
	"published_competition_id" text,
	"user_id" text
);
--> statement-breakpoint
CREATE TABLE "competitions" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"type" "opportunity_type" NOT NULL,
	"org" text NOT NULL,
	"closes_at" date NOT NULL,
	"opens_at" date,
	"event_date" date,
	"region" "region" NOT NULL,
	"venue" text,
	"prize_value" integer DEFAULT 0 NOT NULL,
	"prize_note" text,
	"fee" integer,
	"team_min" integer NOT NULL,
	"team_max" integer NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"keywords" text[] DEFAULT '{}' NOT NULL,
	"source_url" text DEFAULT '' NOT NULL,
	"source" "source" NOT NULL,
	"last_verified_at" date NOT NULL,
	"register_url" text,
	"overview" text,
	"audience" text,
	"format" text[] DEFAULT '{}' NOT NULL,
	"deliverables" text[] DEFAULT '{}' NOT NULL,
	"preparation" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_log" (
	"id" text PRIMARY KEY NOT NULL,
	"to" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"provider" text DEFAULT 'log' NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_type" text NOT NULL,
	"owner_id" text NOT NULL,
	"path" text NOT NULL,
	"original_name" text NOT NULL,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mentor_awards" (
	"id" text PRIMARY KEY NOT NULL,
	"submission_id" text NOT NULL,
	"title" text NOT NULL,
	"competition_slug" text,
	"year" text NOT NULL,
	"evidence" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mentor_submissions" (
	"id" text PRIMARY KEY NOT NULL,
	"status" "submission_status" DEFAULT 'pending' NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"nickname" text NOT NULL,
	"email" text NOT NULL,
	"phone" text NOT NULL,
	"occupation" text NOT NULL,
	"organization" text NOT NULL,
	"role" text NOT NULL,
	"experience" text NOT NULL,
	"portfolio" text DEFAULT '' NOT NULL,
	"best" text NOT NULL,
	"cannot" text NOT NULL,
	"topics" text[] DEFAULT '{}' NOT NULL,
	"price" integer NOT NULL,
	"paid_slot" timestamp with time zone NOT NULL,
	"free_slot" timestamp with time zone NOT NULL,
	"published_mentor_id" text,
	"user_id" text
);
--> statement-breakpoint
CREATE TABLE "mentors" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"avatar" text NOT NULL,
	"bio" text NOT NULL,
	"reply_time" text NOT NULL,
	"won_slug" text,
	"category" "category",
	"topics" integer[] DEFAULT '{}' NOT NULL,
	"price" integer NOT NULL,
	"best" text NOT NULL,
	"cannot" text NOT NULL,
	"first_slot_in_days" integer DEFAULT 1 NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"weekly_rank" integer,
	"weekly_focus" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_events" (
	"id" text PRIMARY KEY NOT NULL,
	"target" "review_target" NOT NULL,
	"target_id" text NOT NULL,
	"decision" "decision" NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"checks" text[] DEFAULT '{}' NOT NULL,
	"reviewed_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "submission_categories" (
	"submission_id" text NOT NULL,
	"category" "category" NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "submission_categories_submission_id_category_pk" PRIMARY KEY("submission_id","category")
);
--> statement-breakpoint
CREATE TABLE "submission_levels" (
	"submission_id" text NOT NULL,
	"level" "level" NOT NULL,
	CONSTRAINT "submission_levels_submission_id_level_pk" PRIMARY KEY("submission_id","level")
);
--> statement-breakpoint
CREATE TABLE "submission_rewards" (
	"submission_id" text NOT NULL,
	"reward" "reward" NOT NULL,
	CONSTRAINT "submission_rewards_submission_id_reward_pk" PRIMARY KEY("submission_id","reward")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text,
	"google_id" text,
	"name" text NOT NULL,
	"avatar_url" text,
	"email_verified_at" timestamp with time zone,
	"role" "user_role" DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "competition_categories" ADD CONSTRAINT "competition_categories_competition_id_competitions_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_levels" ADD CONSTRAINT "competition_levels_competition_id_competitions_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_rewards" ADD CONSTRAINT "competition_rewards_competition_id_competitions_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_submissions" ADD CONSTRAINT "competition_submissions_published_competition_id_competitions_id_fk" FOREIGN KEY ("published_competition_id") REFERENCES "public"."competitions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_submissions" ADD CONSTRAINT "competition_submissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentor_awards" ADD CONSTRAINT "mentor_awards_submission_id_mentor_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."mentor_submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentor_submissions" ADD CONSTRAINT "mentor_submissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_events" ADD CONSTRAINT "review_events_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_categories" ADD CONSTRAINT "submission_categories_submission_id_competition_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."competition_submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_levels" ADD CONSTRAINT "submission_levels_submission_id_competition_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."competition_submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_rewards" ADD CONSTRAINT "submission_rewards_submission_id_competition_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."competition_submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "competition_categories_cat_idx" ON "competition_categories" USING btree ("category");--> statement-breakpoint
CREATE INDEX "competition_submissions_status_idx" ON "competition_submissions" USING btree ("status","submitted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "competitions_slug_key" ON "competitions" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "competitions_closes_idx" ON "competitions" USING btree ("closes_at");--> statement-breakpoint
CREATE INDEX "email_log_to_idx" ON "email_log" USING btree ("to");--> statement-breakpoint
CREATE INDEX "files_owner_idx" ON "files" USING btree ("owner_type","owner_id");--> statement-breakpoint
CREATE INDEX "mentor_awards_submission_idx" ON "mentor_awards" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX "mentor_submissions_status_idx" ON "mentor_submissions" USING btree ("status","submitted_at");--> statement-breakpoint
CREATE INDEX "review_events_target_idx" ON "review_events" USING btree ("target","target_id");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_key" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "users_google_key" ON "users" USING btree ("google_id");