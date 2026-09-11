CREATE TYPE "notification_trigger" AS ENUM ('round_opens', 'round_closes', 'results_released');
CREATE TYPE "notification_recipient" AS ENUM ('registered_educators', 'registered_schools', 'qualifying_entrants');
CREATE TYPE "notification_channel" AS ENUM ('email');

CREATE TABLE "notification_rules" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "olympiad_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "trigger" "notification_trigger" NOT NULL,
  "offset_minutes" INTEGER NOT NULL DEFAULT 0,
  "recipient" "notification_recipient" NOT NULL,
  "channel" "notification_channel" NOT NULL DEFAULT 'email',
  "condition" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notification_rules_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "notification_rules_olympiad_id_fkey"
    FOREIGN KEY ("olympiad_id") REFERENCES "olympiads"("id") ON DELETE CASCADE
);

CREATE INDEX "notification_rules_olympiad_id_enabled_idx"
  ON "notification_rules"("olympiad_id", "enabled");