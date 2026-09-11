-- CreateEnum
CREATE TYPE "exam_status" AS ENUM ('draft', 'ready', 'live');

-- DropForeignKey
ALTER TABLE "entrants" DROP CONSTRAINT "entrants_user_id_fkey";

-- DropForeignKey
ALTER TABLE "invitations" DROP CONSTRAINT "invitations_created_by_id_fkey";

-- DropForeignKey
ALTER TABLE "invitations" DROP CONSTRAINT "invitations_used_by_id_fkey";

-- DropForeignKey
ALTER TABLE "olympiads" DROP CONSTRAINT "olympiads_organiser_id_fkey";

-- AlterTable
ALTER TABLE "questions" ADD COLUMN     "correct_answer" TEXT,
ADD COLUMN     "negative_pct" DECIMAL NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "rounds" ADD COLUMN     "approved_at" TIMESTAMPTZ(6),
ADD COLUMN     "approved_by" UUID,
ADD COLUMN     "exam_status" "exam_status" NOT NULL DEFAULT 'draft',
ADD COLUMN     "notes" TEXT;

-- AlterTable
ALTER TABLE "submissions" ADD COLUMN     "is_late" BOOLEAN NOT NULL DEFAULT false;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_used_by_id_fkey" FOREIGN KEY ("used_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entrants" ADD CONSTRAINT "entrants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "olympiads" ADD CONSTRAINT "olympiads_organiser_id_fkey" FOREIGN KEY ("organiser_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
