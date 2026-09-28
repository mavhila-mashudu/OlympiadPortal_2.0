-- A learner may sit a round online or on paper, not both (A10/A11). The API
-- already refuses the second route, but only by checking before it inserts,
-- so two requests at the same moment could both get through. Enforce it in
-- the database: one submission per learner per round, whatever the route.
-- (Checked before writing this: the shared database has no learner with a
-- submission on both routes, so the index builds cleanly.)
CREATE UNIQUE INDEX "submissions_round_id_entrant_id_key" ON "submissions"("round_id", "entrant_id");

-- The old per-route index is now implied by the new one
DROP INDEX "submissions_round_id_entrant_id_route_key";
