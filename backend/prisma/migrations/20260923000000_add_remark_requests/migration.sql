CREATE TYPE "remark_status" AS ENUM ('pending', 'reviewed');

CREATE TABLE "remark_requests" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "result_id" UUID NOT NULL,
  "reason" TEXT NOT NULL,
  "status" "remark_status" NOT NULL DEFAULT 'pending',
  "reviewer_id" UUID,
  "review_note" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewed_at" TIMESTAMPTZ,
  CONSTRAINT "remark_requests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "remark_requests_result_id_fkey"
    FOREIGN KEY ("result_id") REFERENCES "results"("id") ON DELETE RESTRICT
);

CREATE UNIQUE INDEX "remark_requests_result_id_key"
  ON "remark_requests"("result_id");
