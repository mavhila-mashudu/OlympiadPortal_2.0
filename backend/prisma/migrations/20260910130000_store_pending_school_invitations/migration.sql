-- Store the intended school name on a pending invitation. A school record is
-- created only when the invitee successfully registers with its code.
ALTER TABLE "invitations" ADD COLUMN "school_name" TEXT;
