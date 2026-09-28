-- A remark keeps both links to the student's work: the result (the educator
-- review flow reads remarks through their result) and the round and entrant
-- (the organiser-decision flow lists and decides them per round), plus the
-- organiser's decision and when it was made.
ALTER TABLE "remark_requests"
  ADD COLUMN IF NOT EXISTS "round_id" UUID,
  ADD COLUMN IF NOT EXISTS "entrant_id" UUID,
  ADD COLUMN IF NOT EXISTS "decision" TEXT,
  ADD COLUMN IF NOT EXISTS "decided_at" TIMESTAMPTZ(6);

ALTER TABLE "remark_requests"
  ADD CONSTRAINT "remark_requests_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "rounds"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "remark_requests_entrant_id_fkey" FOREIGN KEY ("entrant_id") REFERENCES "entrants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Outcomes the organiser can reach, alongside the educator review outcome.
ALTER TYPE "remark_status" ADD VALUE IF NOT EXISTS 'approved';
ALTER TYPE "remark_status" ADD VALUE IF NOT EXISTS 'rejected';
