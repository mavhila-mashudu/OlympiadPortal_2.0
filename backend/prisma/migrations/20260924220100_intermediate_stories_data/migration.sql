ALTER TABLE "notification_rules" ALTER COLUMN "channel" SET DEFAULT 'in_app';
UPDATE "notification_rules" SET "channel" = 'in_app' WHERE "channel" = 'email';
CREATE TABLE IF NOT EXISTS "portal_notifications" (
 "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
 "rule_id" UUID REFERENCES "notification_rules"("id") ON DELETE SET NULL,
 "round_id" UUID REFERENCES "rounds"("id") ON DELETE CASCADE,
 "dedupe_key" TEXT NOT NULL UNIQUE,
 "title" TEXT NOT NULL,
 "body" TEXT NOT NULL,
 "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
 "read_at" TIMESTAMPTZ(6)
);
CREATE INDEX IF NOT EXISTS "portal_notifications_user_id_created_at_idx" ON "portal_notifications"("user_id", "created_at");
CREATE TABLE "portal_remark_requests" (
 "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 "round_id" UUID NOT NULL REFERENCES "rounds"("id") ON DELETE CASCADE,
 "entrant_id" UUID NOT NULL REFERENCES "entrants"("id") ON DELETE CASCADE,
 "reason" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'pending',
 "reviewer_id" UUID REFERENCES "users"("id") ON DELETE SET NULL,
 "decision" TEXT,
 "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
 "decided_at" TIMESTAMPTZ(6),
 UNIQUE("round_id", "entrant_id")
);
CREATE TABLE "marking_reviews" (
 "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 "answer_id" UUID NOT NULL REFERENCES "answers"("id") ON DELETE CASCADE,
 "reviewer_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
 "original_points" DECIMAL NOT NULL,
 "revised_points" DECIMAL NOT NULL,
 "comment" TEXT NOT NULL,
 "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);

-- Enable default notifications for olympiads that existed before this upgrade.
INSERT INTO "notification_rules" ("id", "olympiad_id", "name", "trigger", "offset_minutes", "recipient", "channel", "enabled", "created_at", "updated_at")
SELECT gen_random_uuid(), o."id", d.name, d.trigger::notification_trigger, d.offset_minutes, d.recipient::notification_recipient, 'in_app'::notification_channel, true, now(), now()
FROM "olympiads" o CROSS JOIN (VALUES
 ('Round opens soon', 'round_opens', 60, 'registered_educators'),
 ('Round closes soon', 'round_closes', 60, 'registered_educators'),
 ('Submission still missing', 'missing_submission', 60, 'registered_schools'),
 ('Results released', 'results_released', 0, 'registered_schools')
) AS d(name, trigger, offset_minutes, recipient)
WHERE NOT EXISTS (SELECT 1 FROM "notification_rules" r WHERE r."olympiad_id"=o."id" AND r."name"=d.name);
