-- DropForeignKey
ALTER TABLE "notification_rules" DROP CONSTRAINT "notification_rules_olympiad_id_fkey";

-- DropForeignKey
ALTER TABLE "remark_requests" DROP CONSTRAINT "remark_requests_result_id_fkey";

-- DropForeignKey
ALTER TABLE "school_memberships" DROP CONSTRAINT "school_memberships_school_id_fkey";

-- DropForeignKey
ALTER TABLE "school_memberships" DROP CONSTRAINT "school_memberships_user_id_fkey";

-- AlterTable
ALTER TABLE "notification_rules" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "remark_requests" ADD COLUMN     "entrantsId" UUID,
ADD COLUMN     "roundsId" UUID;

-- AddForeignKey
ALTER TABLE "school_memberships" ADD CONSTRAINT "school_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_memberships" ADD CONSTRAINT "school_memberships_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_rules" ADD CONSTRAINT "notification_rules_olympiad_id_fkey" FOREIGN KEY ("olympiad_id") REFERENCES "olympiads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "remark_requests" ADD CONSTRAINT "remark_requests_result_id_fkey" FOREIGN KEY ("result_id") REFERENCES "results"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "remark_requests" ADD CONSTRAINT "remark_requests_entrantsId_fkey" FOREIGN KEY ("entrantsId") REFERENCES "entrants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "remark_requests" ADD CONSTRAINT "remark_requests_roundsId_fkey" FOREIGN KEY ("roundsId") REFERENCES "rounds"("id") ON DELETE SET NULL ON UPDATE CASCADE;
