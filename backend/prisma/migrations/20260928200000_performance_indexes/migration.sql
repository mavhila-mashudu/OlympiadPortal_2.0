-- Foreign-key and lookup indexes for the columns the services filter and
-- join on most. Postgres does not index foreign keys automatically, so these
-- lookups otherwise scan the whole table.
CREATE INDEX IF NOT EXISTS "educators_school_id_idx" ON "educators"("school_id");
CREATE INDEX IF NOT EXISTS "entrants_school_id_full_name_idx" ON "entrants"("school_id", "full_name");
CREATE INDEX IF NOT EXISTS "entrants_school_id_external_ref_idx" ON "entrants"("school_id", "external_ref");
CREATE INDEX IF NOT EXISTS "olympiads_organiser_id_idx" ON "olympiads"("organiser_id");
CREATE INDEX IF NOT EXISTS "school_registrations_olympiad_id_idx" ON "school_registrations"("olympiad_id");
CREATE INDEX IF NOT EXISTS "rounds_olympiad_id_opens_at_idx" ON "rounds"("olympiad_id", "opens_at");
CREATE INDEX IF NOT EXISTS "papers_round_id_idx" ON "papers"("round_id");
CREATE INDEX IF NOT EXISTS "questions_paper_id_idx" ON "questions"("paper_id");
CREATE INDEX IF NOT EXISTS "answers_question_id_idx" ON "answers"("question_id");
CREATE INDEX IF NOT EXISTS "submissions_entrant_id_idx" ON "submissions"("entrant_id");
CREATE INDEX IF NOT EXISTS "submissions_round_id_status_idx" ON "submissions"("round_id", "status");
CREATE INDEX IF NOT EXISTS "entrant_registrations_round_id_idx" ON "entrant_registrations"("round_id");
CREATE INDEX IF NOT EXISTS "results_entrant_id_idx" ON "results"("entrant_id");
CREATE INDEX IF NOT EXISTS "remark_requests_round_id_idx" ON "remark_requests"("round_id");
CREATE INDEX IF NOT EXISTS "remark_requests_entrant_id_idx" ON "remark_requests"("entrant_id");
CREATE INDEX IF NOT EXISTS "marking_reviews_answer_id_idx" ON "marking_reviews"("answer_id");
