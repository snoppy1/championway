CREATE TABLE "competition_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"mentor_id" text NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"details" text DEFAULT '' NOT NULL,
	"price" integer NOT NULL,
	"minutes" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"competition_id" text,
	"decided_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	CONSTRAINT "competition_requests_status_check" CHECK (status in ('pending', 'approved', 'rejected'))
);
--> statement-breakpoint
CREATE TABLE "consultations" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"mentor_id" text NOT NULL,
	"competition_id" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"claimed_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	CONSTRAINT "consultations_status_check" CHECK (status in ('active', 'claimed', 'confirmed', 'cancelled'))
);
--> statement-breakpoint
CREATE TABLE "email_verifications" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"email" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mentor_reviews" (
	"id" text PRIMARY KEY NOT NULL,
	"consultation_id" text NOT NULL,
	"user_id" text NOT NULL,
	"mentor_id" text NOT NULL,
	"stars" smallint NOT NULL,
	"comment" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"hidden_at" timestamp with time zone,
	"hidden_by" text,
	CONSTRAINT "mentor_reviews_stars_check" CHECK (stars between 1 and 5)
);
--> statement-breakpoint
ALTER TABLE "mentor_competition_choices" ADD COLUMN "price" integer;--> statement-breakpoint
ALTER TABLE "mentor_competition_choices" ADD COLUMN "minutes" integer;--> statement-breakpoint
ALTER TABLE "mentor_submissions" ADD COLUMN "minutes" integer;--> statement-breakpoint
ALTER TABLE "mentor_submissions" ADD COLUMN "contact_email" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "mentor_submissions" ADD COLUMN "contact_line" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "mentor_submissions" ADD COLUMN "contact_phone" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "mentor_submissions" ADD COLUMN "contact_instagram" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "mentor_submissions" ADD COLUMN "contact_link" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "mentor_submissions" ADD COLUMN "competition_ids" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "mentors" ADD COLUMN "minutes" integer;--> statement-breakpoint
ALTER TABLE "mentors" ADD COLUMN "contact_email" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "mentors" ADD COLUMN "contact_line" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "mentors" ADD COLUMN "contact_phone" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "mentors" ADD COLUMN "contact_instagram" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "mentors" ADD COLUMN "contact_link" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "competition_requests" ADD CONSTRAINT "competition_requests_mentor_id_mentors_id_fk" FOREIGN KEY ("mentor_id") REFERENCES "public"."mentors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_requests" ADD CONSTRAINT "competition_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_requests" ADD CONSTRAINT "competition_requests_competition_id_competitions_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_requests" ADD CONSTRAINT "competition_requests_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_mentor_id_mentors_id_fk" FOREIGN KEY ("mentor_id") REFERENCES "public"."mentors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_competition_id_competitions_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_verifications" ADD CONSTRAINT "email_verifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentor_reviews" ADD CONSTRAINT "mentor_reviews_consultation_id_consultations_id_fk" FOREIGN KEY ("consultation_id") REFERENCES "public"."consultations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentor_reviews" ADD CONSTRAINT "mentor_reviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentor_reviews" ADD CONSTRAINT "mentor_reviews_mentor_id_mentors_id_fk" FOREIGN KEY ("mentor_id") REFERENCES "public"."mentors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentor_reviews" ADD CONSTRAINT "mentor_reviews_hidden_by_users_id_fk" FOREIGN KEY ("hidden_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "competition_requests_status_idx" ON "competition_requests" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "consultations_user_idx" ON "consultations" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "consultations_mentor_idx" ON "consultations" USING btree ("mentor_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "consultations_open_key" ON "consultations" USING btree ("user_id","mentor_id") WHERE status in ('active', 'claimed');--> statement-breakpoint
CREATE INDEX "email_verifications_user_idx" ON "email_verifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "mentor_reviews_consultation_key" ON "mentor_reviews" USING btree ("consultation_id");--> statement-breakpoint
CREATE INDEX "mentor_reviews_mentor_idx" ON "mentor_reviews" USING btree ("mentor_id","created_at");