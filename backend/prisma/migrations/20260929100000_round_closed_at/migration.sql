-- The moment a round actually closed, set by the lifecycle job or by the
-- organiser closing it by hand. A submission that arrived before this moment
-- (and before the deadline) counts, even if the round had closed by the time
-- the request was processed. Rounds closed before this column existed stay
-- null and keep the stricter rule: a submission to a closed round is refused.
ALTER TABLE "rounds" ADD COLUMN "closed_at" TIMESTAMPTZ(6);
