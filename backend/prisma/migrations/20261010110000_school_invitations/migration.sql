-- One-use signup codes for educators and students. Organisers invite educators
-- to any school; approved educators can invite educator/student to their own
-- school only. Codes grant active account access; no-code signup awaits approval.
-- Student codes create a new entrant, never claim older results by name.
CREATE TABLE "school_invitations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "school_id" UUID NOT NULL,
  "email" TEXT NOT NULL,
  "code_hash" TEXT NOT NULL,
  "role" "school_role",
  "account_type" "user_role" NOT NULL,
  "invited_by_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "used_at" TIMESTAMPTZ(6),
  "used_by_id" UUID,
  "revoked_at" TIMESTAMPTZ(6),
  CONSTRAINT "school_invitations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "school_invitations_role_check" CHECK (
    ("account_type" = 'student' AND "role" IS NULL) OR
    ("account_type" = 'educator' AND "role" IS NOT NULL)
  ),
  CONSTRAINT "school_invitations_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "school_invitations_invited_by_id_fkey" FOREIGN KEY ("invited_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "school_invitations_used_by_id_fkey" FOREIGN KEY ("used_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "school_invitations_code_hash_key" ON "school_invitations"("code_hash");
CREATE INDEX "school_invitations_school_id_created_at_idx" ON "school_invitations"("school_id", "created_at");
CREATE INDEX "school_invitations_email_idx" ON "school_invitations"("email");
