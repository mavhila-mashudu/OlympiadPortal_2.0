-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "public"."round_state" AS ENUM ('scheduled', 'open', 'closed', 'marking', 'results_released');

-- CreateEnum
CREATE TYPE "public"."submission_route" AS ENUM ('online', 'offline');

-- CreateEnum
CREATE TYPE "public"."submission_status" AS ENUM ('received', 'automarked', 'queued_for_marking', 'marked', 'moderated');

-- CreateTable
CREATE TABLE "public"."answers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "submission_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "answer_value" TEXT,
    "is_correct" BOOLEAN,
    "points_awarded" DECIMAL,
    "marked_by" UUID,
    "marked_at" TIMESTAMPTZ(6),

    CONSTRAINT "answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."educators" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "educators_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."entrant_registrations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "entrant_id" UUID NOT NULL,
    "round_id" UUID NOT NULL,
    "registered_by" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'registered',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entrant_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."entrants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID,
    "school_id" UUID NOT NULL,
    "full_name" TEXT NOT NULL,
    "grade" TEXT,
    "external_ref" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entrants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."olympiads" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "organiser_id" UUID NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Johannesburg',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "olympiads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."papers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "round_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "file_url" TEXT,
    "memo_file_url" TEXT,
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "released_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "papers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."questions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "paper_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "options" JSONB,
    "correct_option" TEXT,
    "max_points" DECIMAL NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."results" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "round_id" UUID NOT NULL,
    "entrant_id" UUID NOT NULL,
    "total_points" DECIMAL NOT NULL DEFAULT 0,
    "rank" INTEGER,
    "qualified" BOOLEAN NOT NULL DEFAULT false,
    "finalised_at" TIMESTAMPTZ(6),

    CONSTRAINT "results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."rounds" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "olympiad_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "opens_at" TIMESTAMPTZ(6) NOT NULL,
    "closes_at" TIMESTAMPTZ(6) NOT NULL,
    "results_release_at" TIMESTAMPTZ(6),
    "state" "public"."round_state" NOT NULL DEFAULT 'scheduled',
    "qualifying_threshold" DECIMAL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rounds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."school_registrations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "olympiad_id" UUID NOT NULL,
    "registered_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "school_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."schools" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "address" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "schools_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."submissions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "round_id" UUID NOT NULL,
    "entrant_id" UUID NOT NULL,
    "submitted_by" UUID,
    "route" "public"."submission_route" NOT NULL DEFAULT 'offline',
    "status" "public"."submission_status" NOT NULL DEFAULT 'received',
    "idempotency_key" TEXT NOT NULL,
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "round_close_snapshot" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "auth_provider_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "answers_submission_id_question_id_key" ON "public"."answers"("submission_id" ASC, "question_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "educators_user_id_key" ON "public"."educators"("user_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "entrant_registrations_entrant_id_round_id_key" ON "public"."entrant_registrations"("entrant_id" ASC, "round_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "entrants_user_id_key" ON "public"."entrants"("user_id" ASC);

-- CreateIndex
CREATE INDEX "idx_results_round_rank" ON "public"."results"("round_id" ASC, "rank" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "results_round_id_entrant_id_key" ON "public"."results"("round_id" ASC, "entrant_id" ASC);

-- CreateIndex
CREATE INDEX "idx_rounds_state_times" ON "public"."rounds"("state" ASC, "opens_at" ASC, "closes_at" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "school_registrations_school_id_olympiad_id_key" ON "public"."school_registrations"("school_id" ASC, "olympiad_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "submissions_idempotency_key_key" ON "public"."submissions"("idempotency_key" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "submissions_round_id_entrant_id_route_key" ON "public"."submissions"("round_id" ASC, "entrant_id" ASC, "route" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "public"."users"("email" ASC);

-- AddForeignKey
ALTER TABLE "public"."answers" ADD CONSTRAINT "answers_marked_by_fkey" FOREIGN KEY ("marked_by") REFERENCES "public"."users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."answers" ADD CONSTRAINT "answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."answers" ADD CONSTRAINT "answers_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."educators" ADD CONSTRAINT "educators_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."educators" ADD CONSTRAINT "educators_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."entrant_registrations" ADD CONSTRAINT "entrant_registrations_entrant_id_fkey" FOREIGN KEY ("entrant_id") REFERENCES "public"."entrants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."entrant_registrations" ADD CONSTRAINT "entrant_registrations_registered_by_fkey" FOREIGN KEY ("registered_by") REFERENCES "public"."educators"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."entrant_registrations" ADD CONSTRAINT "entrant_registrations_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "public"."rounds"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."entrants" ADD CONSTRAINT "entrants_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."entrants" ADD CONSTRAINT "entrants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."olympiads" ADD CONSTRAINT "olympiads_organiser_id_fkey" FOREIGN KEY ("organiser_id") REFERENCES "public"."users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."papers" ADD CONSTRAINT "papers_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "public"."rounds"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."questions" ADD CONSTRAINT "questions_paper_id_fkey" FOREIGN KEY ("paper_id") REFERENCES "public"."papers"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."results" ADD CONSTRAINT "results_entrant_id_fkey" FOREIGN KEY ("entrant_id") REFERENCES "public"."entrants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."results" ADD CONSTRAINT "results_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "public"."rounds"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."rounds" ADD CONSTRAINT "rounds_olympiad_id_fkey" FOREIGN KEY ("olympiad_id") REFERENCES "public"."olympiads"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."school_registrations" ADD CONSTRAINT "school_registrations_olympiad_id_fkey" FOREIGN KEY ("olympiad_id") REFERENCES "public"."olympiads"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."school_registrations" ADD CONSTRAINT "school_registrations_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."submissions" ADD CONSTRAINT "submissions_entrant_id_fkey" FOREIGN KEY ("entrant_id") REFERENCES "public"."entrants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."submissions" ADD CONSTRAINT "submissions_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "public"."rounds"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."submissions" ADD CONSTRAINT "submissions_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "public"."educators"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

