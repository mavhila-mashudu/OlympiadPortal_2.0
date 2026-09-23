-- Open signup: nobody needs an invitation code any more, so the code/token
-- based `invitations` table is replaced by in-app olympiad invites that the
-- invitee accepts or rejects from their dashboard.

CREATE TYPE "invite_status" AS ENUM ('pending', 'accepted', 'rejected');

CREATE TABLE "olympiad_invites" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "olympiad_id" UUID NOT NULL,
  "school_id" UUID,
  "invitee_id" UUID NOT NULL,
  "invited_by_id" UUID NOT NULL,
  "role" "user_role" NOT NULL,
  "status" "invite_status" NOT NULL DEFAULT 'pending',
  "message" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "responded_at" TIMESTAMPTZ,
  CONSTRAINT "olympiad_invites_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "olympiad_invites_olympiad_id_invitee_id_key" UNIQUE ("olympiad_id", "invitee_id"),
  CONSTRAINT "olympiad_invites_olympiad_id_fkey" FOREIGN KEY ("olympiad_id") REFERENCES "olympiads"("id") ON DELETE CASCADE,
  CONSTRAINT "olympiad_invites_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE,
  CONSTRAINT "olympiad_invites_invitee_id_fkey" FOREIGN KEY ("invitee_id") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "olympiad_invites_invited_by_id_fkey" FOREIGN KEY ("invited_by_id") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE INDEX "olympiad_invites_invitee_id_status_idx" ON "olympiad_invites"("invitee_id", "status");
CREATE INDEX "olympiad_invites_olympiad_id_status_idx" ON "olympiad_invites"("olympiad_id", "status");
CREATE INDEX "olympiad_invites_school_id_idx" ON "olympiad_invites"("school_id");

-- Carry over invitations that were already claimed, so the people who joined
-- through the old flow keep a record of how they got in. Unclaimed codes are
-- dropped: there is nothing left to redeem them against.
INSERT INTO "olympiad_invites"
  ("olympiad_id", "school_id", "invitee_id", "invited_by_id", "role", "status", "created_at", "responded_at")
SELECT
  i."olympiad_id",
  i."school_id",
  i."used_by_id",
  COALESCE(i."created_by_id", i."used_by_id"),
  CASE WHEN i."type" = 'student' THEN 'student'::"user_role" ELSE 'educator'::"user_role" END,
  'accepted'::"invite_status",
  i."created_at",
  COALESCE(i."accepted_at", i."created_at")
FROM "invitations" i
WHERE i."used_by_id" IS NOT NULL AND i."olympiad_id" IS NOT NULL
ON CONFLICT ("olympiad_id", "invitee_id") DO NOTHING;

DROP TABLE "invitations";
DROP TYPE "invite_type";
