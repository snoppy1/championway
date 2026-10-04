CREATE TABLE "staff_alerts" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"actor_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "staff_alerts_kind_idx" ON "staff_alerts" USING btree ("kind","created_at");--> statement-breakpoint
CREATE INDEX "staff_alerts_actor_idx" ON "staff_alerts" USING btree ("actor_id","kind","created_at");