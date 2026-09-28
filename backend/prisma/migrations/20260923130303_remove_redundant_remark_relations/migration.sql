/*
  Warnings:

  - You are about to drop the column `entrantsId` on the `remark_requests` table. All the data in the column will be lost.
  - You are about to drop the column `roundsId` on the `remark_requests` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "remark_requests" DROP CONSTRAINT "remark_requests_entrantsId_fkey";

-- DropForeignKey
ALTER TABLE "remark_requests" DROP CONSTRAINT "remark_requests_roundsId_fkey";

-- AlterTable
ALTER TABLE "remark_requests" DROP COLUMN "entrantsId",
DROP COLUMN "roundsId";
