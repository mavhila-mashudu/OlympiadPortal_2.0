-- This migration was already applied to the shared Supabase database.
-- It is retained locally so Prisma migration history matches the database.

CREATE TABLE "sent_notifications" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "dedup_key" TEXT NOT NULL,
  "round_id" UUID NOT NULL,
  "recipient" TEXT NOT NULL,
  "sent_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sent_notifications_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sent_notifications_round_id_fkey"
    FOREIGN KEY ("round_id") REFERENCES "rounds"("id") ON DELETE CASCADE ON UPDATE NO ACTION
);

CREATE UNIQUE INDEX "sent_notifications_dedup_key_round_id_recipient_key"
  ON "sent_notifications"("dedup_key", "round_id", "recipient");

CREATE INDEX "sent_notifications_round_id_idx"
  ON "sent_notifications"("round_id");
