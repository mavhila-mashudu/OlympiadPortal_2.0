/*
  Warnings:

  - You are about to drop the column `password_hash` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `password_reset_expires` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `password_reset_token` on the `users` table. All the data in the column will be lost.
  - You are about to drop the `refresh_tokens` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "refresh_tokens" DROP CONSTRAINT "refresh_tokens_user_id_fkey";

-- DropIndex
DROP INDEX "users_password_reset_token_key";

-- AlterTable
ALTER TABLE "users" DROP COLUMN "password_hash",
DROP COLUMN "password_reset_expires",
DROP COLUMN "password_reset_token",
ALTER COLUMN "id" DROP DEFAULT;

-- DropTable
DROP TABLE "refresh_tokens";
