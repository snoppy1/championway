CREATE TABLE "booking_events" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_id" text NOT NULL,
	"actor_id" text NOT NULL,
	"action" text NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"mentor_id" text NOT NULL,
	"mentor_user_id" text NOT NULL,
	"competition_id" text NOT NULL,
	"slot_id" text NOT NULL,
	"room_id" text,
	"title" text NOT NULL,
	"context" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"updated_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mentor_competition_choices" (
	"mentor_id" text NOT NULL,
	"competition_id" text NOT NULL,
	"choice" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mentor_competition_choices_mentor_id_competition_id_pk" PRIMARY KEY("mentor_id","competition_id")
);
--> statement-breakpoint
CREATE TABLE "mentor_match_audit" (
	"mentor_id" text PRIMARY KEY NOT NULL,
	"version" text NOT NULL,
	"scores" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mentor_slots" (
	"id" text PRIMARY KEY NOT NULL,
	"mentor_id" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"cancelled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mentor_submissions" ALTER COLUMN "price" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "mentor_submissions" ALTER COLUMN "paid_slot" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "mentor_submissions" ALTER COLUMN "free_slot" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "mentors" ALTER COLUMN "price" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_rooms" ADD COLUMN "competition_id" text;--> statement-breakpoint
ALTER TABLE "competition_submissions" ADD COLUMN "kind" text;--> statement-breakpoint
ALTER TABLE "competition_submissions" ADD COLUMN "themes" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "competitions" ADD COLUMN "kind" text;--> statement-breakpoint
ALTER TABLE "competitions" ADD COLUMN "themes" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "mentor_awards" ADD COLUMN "verified_themes" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "mentor_awards" ADD COLUMN "verified_by" text;--> statement-breakpoint
ALTER TABLE "mentor_awards" ADD COLUMN "verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "mentors" ADD COLUMN "confirmed_themes" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "mentors" ADD COLUMN "disabled_themes" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "booking_events" ADD CONSTRAINT "booking_events_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_events" ADD CONSTRAINT "booking_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_mentor_id_mentors_id_fk" FOREIGN KEY ("mentor_id") REFERENCES "public"."mentors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_mentor_user_id_users_id_fk" FOREIGN KEY ("mentor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_competition_id_competitions_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_slot_id_mentor_slots_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."mentor_slots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_room_id_chat_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."chat_rooms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentor_competition_choices" ADD CONSTRAINT "mentor_competition_choices_mentor_id_mentors_id_fk" FOREIGN KEY ("mentor_id") REFERENCES "public"."mentors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentor_competition_choices" ADD CONSTRAINT "mentor_competition_choices_competition_id_competitions_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentor_match_audit" ADD CONSTRAINT "mentor_match_audit_mentor_id_mentors_id_fk" FOREIGN KEY ("mentor_id") REFERENCES "public"."mentors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentor_slots" ADD CONSTRAINT "mentor_slots_mentor_id_mentors_id_fk" FOREIGN KEY ("mentor_id") REFERENCES "public"."mentors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bookings_owner_idx" ON "bookings" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "bookings_mentor_idx" ON "bookings" USING btree ("mentor_id");--> statement-breakpoint
CREATE INDEX "mentor_slots_time_idx" ON "mentor_slots" USING btree ("mentor_id","starts_at");--> statement-breakpoint
ALTER TABLE "chat_rooms" ADD CONSTRAINT "chat_rooms_competition_id_competitions_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentor_awards" ADD CONSTRAINT "mentor_awards_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;