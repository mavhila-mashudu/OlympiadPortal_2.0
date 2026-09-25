CREATE TABLE "round_events" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "round_id" UUID NOT NULL,
  "kind" TEXT NOT NULL,
  "origin" TEXT NOT NULL,
  "event_key" TEXT NOT NULL UNIQUE,
  "details" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);
CREATE INDEX "round_events_round_id_occurred_at_idx" ON "round_events"("round_id", "occurred_at");

CREATE TABLE "submission_deadline_decisions" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "round_id" UUID NOT NULL,
  "entrant_id" UUID NOT NULL,
  "route" TEXT NOT NULL,
  "accepted" BOOLEAN NOT NULL,
  "decided_at" TIMESTAMPTZ(6) NOT NULL,
  "closes_at" TIMESTAMPTZ(6) NOT NULL,
  "explanation" TEXT NOT NULL
);
CREATE INDEX "submission_deadline_decisions_round_id_decided_at_idx" ON "submission_deadline_decisions"("round_id", "decided_at");
