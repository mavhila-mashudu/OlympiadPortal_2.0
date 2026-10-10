-- A student who signs up must be approved by their school's coordinator before
-- the account gives access. Existing entrants (listed by educators, or already
-- signed up) stay active; only new student signups start as 'pending'.
-- Reuses the membership_status values added in 20261010070000_membership_approval.
ALTER TABLE "entrants" ADD COLUMN "status" "membership_status" NOT NULL DEFAULT 'active';

CREATE INDEX "entrants_school_id_status_idx" ON "entrants" ("school_id", "status");
