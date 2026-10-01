ALTER TABLE "consultations" DROP CONSTRAINT "consultations_status_check";--> statement-breakpoint
DROP INDEX "consultations_open_key";--> statement-breakpoint
ALTER TABLE "consultations" ALTER COLUMN "status" SET DEFAULT 'requested';--> statement-breakpoint
ALTER TABLE "consultations" ADD COLUMN "minutes" integer DEFAULT 60 NOT NULL;--> statement-breakpoint
ALTER TABLE "consultations" ADD COLUMN "price" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "consultations" ADD COLUMN "preferred_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "consultations" ADD COLUMN "note" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "consultations" ADD COLUMN "reason" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "consultations" ADD COLUMN "room_id" text;--> statement-breakpoint
ALTER TABLE "consultations" ADD COLUMN "accepted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "consultations" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_room_id_chat_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."chat_rooms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- แถวจากรุ่นติดต่อนอกเว็บ: ที่เมนเทอร์ยืนยันแล้วถือว่าเสร็จงาน (รีวิวเดิมยังนับ) ที่ค้างอยู่ปิดเป็นยกเลิก
UPDATE "consultations" SET "status" = 'completed', "completed_at" = coalesce("confirmed_at", "created_at") WHERE "status" = 'confirmed';--> statement-breakpoint
UPDATE "consultations" SET "status" = 'cancelled', "cancelled_at" = coalesce("cancelled_at", now()) WHERE "status" in ('active', 'claimed');--> statement-breakpoint
CREATE UNIQUE INDEX "consultations_open_key" ON "consultations" USING btree ("user_id","mentor_id") WHERE status in ('requested', 'accepted');--> statement-breakpoint
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_status_check" CHECK (status in ('requested', 'accepted', 'declined', 'cancelled', 'completed'));