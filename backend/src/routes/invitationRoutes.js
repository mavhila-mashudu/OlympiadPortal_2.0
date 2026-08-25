const { Router } = require("express");
const prismaModule = require("../config/prisma");
const prisma = prismaModule.prisma || prismaModule.default || prismaModule;

const { generateInviteCode } = require("../utils/codeGenerator");
const { sendSchoolInviteEmail } = require("../lib/mailer");
const { requireAuth, requireRole } = require("../middlewares/auth");

const router = Router();

// ORGANISER SIDE: Invite a school to an Olympiad
router.post(
  "/olympiads/:olympiadId/invite-school",
  requireAuth,
  requireRole("organiser"),
  async (req, res) => {
    try {
      const { olympiadId } = req.params;
      const { schoolName, contactEmail } = req.body;
      const createdById = req.user?.id;

      if (!schoolName || !contactEmail) {
        return res
          .status(400)
          .json({ error: "School name and contact email are required." });
      }

      const olympiad = await prisma.olympiad.findUnique({
        where: { id: olympiadId },
      });

      if (!olympiad) {
        return res.status(404).json({ error: "Olympiad not found." });
      }

      const { school, invitation } = await prisma.$transaction(async (tx) => {
        // Step 1: Create school record
        const school = await tx.school.create({
          data: { name: schoolName },
        });

        // Step 2: Link school to olympiad
        await tx.schoolRegistration.create({
          data: {
            school_id: school.id,
            olympiad_id: olympiadId,
          },
        });

        // Step 3: Generate unique code & set 7-day expiry
        const code = generateInviteCode();
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

        // Step 4: Create invitation record
        const invitation = await tx.invitation.create({
          data: {
            code,
            type: "school",
            olympiad_id: olympiadId,
            school_id: school.id,
            email: contactEmail,
            created_by_id: createdById || null,
            expires_at: expiresAt,
          },
        });

        return { school, invitation };
      });

      // Step 5: Send email notification
      await sendSchoolInviteEmail({
        to: contactEmail,
        schoolName: school.name,
        olympiadName: olympiad.name,
        inviteCode: invitation.code,
      });

      return res.status(201).json({
        success: true,
        message: "Invitation sent successfully.",
        invitationCode: invitation.code,
      });
    } catch (error) {
      console.error("Error inviting school:", error);
      return res
        .status(500)
        .json({ error: error.message || "Internal server error." });
    }
  }
);

// EDUCATOR SIDE: Verify Invitation Details
router.get("/invitations/verify", async (req, res) => {
  try {
    const { code } = req.query;

    if (!code) {
      return res.status(400).json({ error: "Invitation code is required." });
    }

    const invitation = await prisma.invitation.findUnique({
      where: { code: String(code) },
      include: {
        school: true,
        olympiad: true,
      },
    });

    if (!invitation) {
      return res.status(404).json({ error: "Invalid invitation code." });
    }

    if (invitation.used_by_id) {
      return res
        .status(400)
        .json({ error: "This invitation code has already been used." });
    }

    if (new Date() > invitation.expires_at) {
      return res
        .status(400)
        .json({ error: "This invitation code has expired." });
    }

    return res.json({
      email: invitation.email,
      schoolName: invitation.school?.name,
      olympiadName: invitation.olympiad?.name,
      schoolId: invitation.school_id,
      olympiadId: invitation.olympiad_id,
    });
  } catch (error) {
    console.error("Error verifying invitation:", error);
    return res
      .status(500)
      .json({ error: error.message || "Internal server error." });
  }
});

// EDUCATOR SIDE: Register User & Link Educator
router.post("/auth/register-educator", async (req, res) => {
  try {
    const { code, fullName, email, userId } = req.body;

    if (!code || !fullName || !email || !userId) {
      return res.status(400).json({ error: "Missing required fields." });
    }

    const invitation = await prisma.invitation.findUnique({
      where: { code },
    });

    if (
      !invitation ||
      invitation.used_by_id ||
      new Date() > invitation.expires_at
    ) {
      return res
        .status(400)
        .json({ error: "Invalid or expired invitation code." });
    }

    const user = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          id: userId,
          email,
          full_name: fullName,
          role: "educator",
          auth_provider_id: userId,
        },
      });

      await tx.educator.create({
        data: {
          user_id: newUser.id,
          school_id: invitation.school_id,
        },
      });

      await tx.invitation.update({
        where: { id: invitation.id },
        data: { used_by_id: newUser.id },
      });

      return newUser;
    });

    return res.status(201).json({ success: true, user });
  } catch (error) {
    console.error("Error registering educator:", error);
    return res
      .status(500)
      .json({ error: error.message || "Internal server error." });
  }
});

module.exports = router;