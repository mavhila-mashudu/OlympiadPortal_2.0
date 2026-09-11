CREATE TYPE "school_role" AS ENUM ('coordinator', 'educator');
CREATE TYPE "membership_status" AS ENUM ('active', 'removed');
CREATE TYPE "registration_status" AS ENUM ('pending', 'approved', 'withdrawn');

ALTER TABLE "invitations"
  ADD COLUMN "token_hash" TEXT,
  ADD COLUMN "intended_school_role" "school_role",
  ADD COLUMN "accepted_at" TIMESTAMPTZ;

CREATE UNIQUE INDEX "invitations_token_hash_key" ON "invitations"("token_hash");

CREATE TABLE "school_memberships" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "school_id" UUID NOT NULL,
  "role" "school_role" NOT NULL,
  "status" "membership_status" NOT NULL DEFAULT 'active',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "school_memberships_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "school_memberships_user_id_school_id_key" UNIQUE ("user_id", "school_id"),
  CONSTRAINT "school_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "school_memberships_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE
);
CREATE INDEX "school_memberships_school_id_role_status_idx" ON "school_memberships"("school_id", "role", "status");

-- Preserve existing educator access when adopting memberships.
INSERT INTO "school_memberships" ("user_id", "school_id", "role")
SELECT "user_id", "school_id", 'educator'::"school_role" FROM "educators"
ON CONFLICT ("user_id", "school_id") DO NOTHING;

ALTER TABLE "school_registrations"
  ADD COLUMN "status" "registration_status" NOT NULL DEFAULT 'approved';
