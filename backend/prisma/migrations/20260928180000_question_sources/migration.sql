-- A question imported from the bank records the original it was copied from,
-- so the bank can list each question once, refuse to put it on a paper twice,
-- and pool its answers across rounds when working out its difficulty.
ALTER TABLE "questions" ADD COLUMN "source_question_id" UUID;

ALTER TABLE "questions"
  ADD CONSTRAINT "questions_source_question_id_fkey" FOREIGN KEY ("source_question_id") REFERENCES "questions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "questions_source_question_id_idx" ON "questions"("source_question_id");

-- Copies made before this migration have no link. Identical questions of the
-- same organiser (same type, prompt, options, answers and marks) are treated
-- as one question: each is linked to the earliest of them.
WITH owned AS (
  SELECT q."id", q."created_at", o."organiser_id", q."type", q."prompt", q."options",
         q."correct_option", q."correct_answer", q."max_points", q."negative_pct"
  FROM "questions" q
  JOIN "papers" p ON p."id" = q."paper_id"
  JOIN "rounds" r ON r."id" = p."round_id"
  JOIN "olympiads" o ON o."id" = r."olympiad_id"
), families AS (
  SELECT "id",
         first_value("id") OVER (
           PARTITION BY "organiser_id", "type", "prompt", "options", "correct_option",
                        "correct_answer", "max_points", "negative_pct"
           ORDER BY "created_at", "id"
         ) AS "original_id"
  FROM owned
)
UPDATE "questions" q
SET "source_question_id" = families."original_id"
FROM families
WHERE q."id" = families."id"
  AND families."original_id" <> q."id";
