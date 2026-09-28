CREATE TABLE "exam_assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "round_id" UUID NOT NULL,
    "entrant_id" UUID NOT NULL,
    "question_order" JSONB NOT NULL,
    "option_orders" JSONB NOT NULL,
    "variant_hash" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exam_assignments_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "submissions" ADD COLUMN "exam_assignment_id" UUID;

CREATE UNIQUE INDEX "exam_assignments_round_id_entrant_id_key"
    ON "exam_assignments"("round_id", "entrant_id");
CREATE UNIQUE INDEX "exam_assignments_round_id_variant_hash_key"
    ON "exam_assignments"("round_id", "variant_hash");
CREATE INDEX "exam_assignments_round_id_idx"
    ON "exam_assignments"("round_id");

ALTER TABLE "exam_assignments"
    ADD CONSTRAINT "exam_assignments_round_id_fkey"
    FOREIGN KEY ("round_id") REFERENCES "rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "exam_assignments"
    ADD CONSTRAINT "exam_assignments_entrant_id_fkey"
    FOREIGN KEY ("entrant_id") REFERENCES "entrants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "submissions"
    ADD CONSTRAINT "submissions_exam_assignment_id_fkey"
    FOREIGN KEY ("exam_assignment_id") REFERENCES "exam_assignments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
