// @ts-nocheck
const { createClient } = require("@supabase/supabase-js");
const prisma = require("../config/database").default;
const config = require("../config/env");
const {
  ConflictError,
  BadRequestError,
  NotFoundError,
  UnauthorizedError,
} = require("../errors/AppError");
const {
  generateInvitationCode,
  getInvitationExpiry,
} = require("../utils/invitations");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
);

// ─────────────────────────────────────────
// REGISTER ORGANISER
// ─────────────────────────────────────────
const registerOrganiser = async ({
  full_name,
  email,
  password,
  organiserSecret,
}) => {
  if (organiserSecret !== config.auth.organiserSecret) {
    throw new UnauthorizedError("Invalid organiser secret");
  }

  // Check email not already in your DB
  const existing = await prisma.users.findUnique({ where: { email } });
  if (existing) throw new ConflictError("Email already registered");

  // Create auth user in Supabase
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // auto-confirm for organiser
  });

  if (error) throw new BadRequestError(error.message);

  // Create profile in your DB using Supabase's user ID
  const user = await prisma.users.create({
    data: {
      id: data.user.id, // same ID as Supabase auth
      full_name,
      email,
      role: "organiser",
    },
    select: {
      id: true,
      full_name: true,
      email: true,
      role: true,
      created_at: true,
    },
  });

  return { user };
};

// ─────────────────────────────────────────
// REGISTER WITH INVITATION CODE
// ─────────────────────────────────────────
const registerWithCode = async ({ full_name, email, password, code }) => {
  // Validate invitation
  const invitation = await prisma.invitations.findUnique({
    where: { code },
    include: { schools: true, olympiads: true },
  });

  if (!invitation) throw new BadRequestError("Invalid invitation code");
  if (invitation.used_by_id) throw new ConflictError("Invitation already used");
  if (invitation.expires_at < new Date())
    throw new BadRequestError("Invitation expired");

  // Check email not taken
  const existing = await prisma.users.findUnique({ where: { email } });
  if (existing) throw new ConflictError("Email already registered");

  // Create Supabase auth user
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error) throw new BadRequestError(error.message);

  const role = invitation.type === "school" ? "educator" : invitation.type;

  // Create profile + role record in transaction
  const user = await prisma.$transaction(async (tx) => {
    const newUser = await tx.users.create({
      data: {
        id: data.user.id,
        full_name,
        email,
        role,
      },
      select: {
        id: true,
        full_name: true,
        email: true,
        role: true,
        created_at: true,
      },
    });

    if (role === "educator") {
      await tx.educators.create({
        data: {
          user_id: newUser.id,
          school_id: invitation.school_id,
        },
      });

      if (invitation.type === "school" && invitation.olympiad_id) {
        await tx.school_registrations.upsert({
          where: {
            school_id_olympiad_id: {
              school_id: invitation.school_id,
              olympiad_id: invitation.olympiad_id,
            },
          },
          update: {},
          create: {
            school_id: invitation.school_id,
            olympiad_id: invitation.olympiad_id,
          },
        });
      }
    }

    if (role === "student") {
      const entrant = await tx.entrants.findFirst({
        where: { school_id: invitation.school_id, user_id: null },
      });
      if (entrant) {
        await tx.entrants.update({
          where: { id: entrant.id },
          data: { user_id: newUser.id, full_name },
        });
      }
    }

    await tx.invitations.update({
      where: { code },
      data: { used_by_id: newUser.id },
    });

    return newUser;
  });

  return { user };
};

// ─────────────────────────────────────────
// VALIDATE INVITATION CODE
// ─────────────────────────────────────────
const validateInvitationCode = async (code) => {
  const invitation = await prisma.invitations.findUnique({
    where: { code },
    include: {
      schools: { select: { id: true, name: true } },
      olympiads: { select: { id: true, name: true } },
    },
  });

  if (!invitation) throw new NotFoundError("Invalid invitation code");
  if (invitation.used_by_id)
    throw new BadRequestError("Invitation already used");
  if (invitation.expires_at < new Date())
    throw new BadRequestError("Invitation expired");

  return {
    valid: true,
    type: invitation.type,
    school: invitation.schools || null,
    olympiad: invitation.olympiads || null,
  };
};

// ─────────────────────────────────────────
// DELETE ACCOUNT (soft delete)
// ─────────────────────────────────────────
const deleteAccount = async (userId) => {
  // Disable in Supabase Auth
  await supabase.auth.admin.deleteUser(userId);

  // Soft delete in your DB
  await prisma.users.update({
    where: { id: userId },
    data: { deleted_at: new Date() },
  });
};

// ─────────────────────────────────────────
// INVITE SCHOOL
// ─────────────────────────────────────────
const inviteSchool = async ({
  schoolName,
  contactEmail,
  olympiadId,
  organiserId,
}) => {
  const olympiad = await prisma.olympiads.findUnique({
    where: { id: olympiadId },
    select: { name: true },
  });

  const school = await prisma.schools.create({
    data: { name: schoolName },
  });

  const code = generateInvitationCode("school");
  const expires_at = getInvitationExpiry("school");

  const invitation = await prisma.invitations.create({
    data: {
      code,
      type: "school",
      olympiad_id: olympiadId,
      school_id: school.id,
      email: contactEmail,
      created_by_id: organiserId,
      expires_at,
    },
  });

  // TODO: send email with code
  // await emailService.sendSchoolInvitation({...})

  return { school, invitation, code };
};

// ─────────────────────────────────────────
// INVITE EDUCATOR
// ─────────────────────────────────────────
const inviteEducator = async ({ email, schoolId, olympiadId, createdById }) => {
  const code = generateInvitationCode("educator");

  const invitation = await prisma.invitations.create({
    data: {
      code,
      type: "educator",
      school_id: schoolId,
      olympiad_id: olympiadId,
      email,
      created_by_id: createdById,
      expires_at: getInvitationExpiry("educator"),
    },
  });

  return { invitation, code };
};

// ─────────────────────────────────────────
// GENERATE STUDENT CODES
// ─────────────────────────────────────────
const generateStudentCodes = async ({
  count,
  schoolId,
  olympiadId,
  createdById,
}) => {
  const codes = [];

  for (let i = 0; i < count; i++) {
    const code = generateInvitationCode("student");

    const entrant = await prisma.entrants.create({
      data: {
        school_id: schoolId,
        full_name: "Pending Registration",
      },
    });

    await prisma.invitations.create({
      data: {
        code,
        type: "student",
        school_id: schoolId,
        olympiad_id: olympiadId,
        created_by_id: createdById,
        expires_at: getInvitationExpiry("student"),
      },
    });

    codes.push({ code, entrantId: entrant.id });
  }

  return codes;
};

module.exports = {
  registerOrganiser,
  registerWithCode,
  validateInvitationCode,
  deleteAccount,
  inviteSchool,
  inviteEducator,
  generateStudentCodes,
};
