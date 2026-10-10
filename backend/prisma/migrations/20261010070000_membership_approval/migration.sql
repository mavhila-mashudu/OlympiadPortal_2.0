-- Separate migration: PostgreSQL requires new enum values to be committed
-- before they can be used in inserts or updates.
ALTER TYPE "membership_status" ADD VALUE IF NOT EXISTS 'pending';
ALTER TYPE "membership_status" ADD VALUE IF NOT EXISTS 'rejected';

-- Reject two active coordinators for the same school, even under concurrent approval.
-- Before deploying, inspect old data for duplicate active coordinators.
CREATE UNIQUE INDEX IF NOT EXISTS "school_single_active_coordinator"
ON "school_memberships" ("school_id")
WHERE "role" = 'coordinator' AND "status" = 'active';
