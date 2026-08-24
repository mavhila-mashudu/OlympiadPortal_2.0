// @ts-nocheck
const prisma = require("../config/database").default;
const config = require("../config/env");
const supabase = require("../config/supabase");
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

const SAFE_USER_FIELDS = {
  id: true,
  full_name: true,
  email: true,
  role: true,
  created_at: true,
};

const ensureSupabaseConfigured = () => {
  if (!supabase) {
    throw new BadRequestError("Supabase is not configured on the server");
  }
};

const createSupabaseUser = async ({ email, password }) => {
  ensureSupabaseConfigured();

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error) {
    throw new BadRequestError(error.message);
  }

  return data.user;
};

const deleteSupabaseUserIfCreated = async (userId) => {
  if (!supabase || !userId) return;

  await supabase.auth.admin.deleteUser(userId);
};

const registerOrganiser = async ({
  full_name,
  email,
  password,
  organiserSecret,
}) => {
  if (organiserSecret !== config.auth.organiserSecret) {
    throw new UnauthorizedError("Invalid organiser secret");
  }

  const existing = await prisma.users.findUnique({
    where: { email },
    select: { id: true },
  });
  if (existing) {
    throw new ConflictError("Email already registered");
  }

  const authUser = await createSupabaseUser({ email, password });

  try {
    const user = await prisma.users.create({
      data: {
        id: authUser.id,
        auth_provider_id: authUser.id,
        full_name,
        email,
        role: "organiser",
      },
      select: SAFE_USER_FIELDS,
    });

    return { user };
  } catch (err) {
    await deleteSupabaseUserIfCreated(authUser.id);
    throw err;
  }
};

const registerWithCode = async ({ full_name, email, password, code }) => {
  const invitation = await prisma.invitations.findUnique({
    where: { code },
    include: { schools: true, olympiads: true },
  });

  if (!invitation) {
    throw new BadRequestError("Invalid invitation code");
  }
  if (invitation.used_by_id) {
    throw new ConflictError("Invitation already used");
  }
  if (invitation.expires_at < new Date()) {
    throw new BadRequestError("Invitation expired");
  }
  if (invitation.email && invitation.email.toLowerCase() !== email.toLowerCase()) {
    throw new BadRequestError("This invitation was issued for a different email");
  }
  if (!invitation.school_id && invitation.type !== "school") {
    throw new BadRequestError("Invitation is missing a school");
  }

  const existing = await prisma.users.findUnique({
    where: { email },
    select: { id: true },
  });
  if (existing) {
    throw new ConflictError("Email already registered");
  }

  const authUser = await createSupabaseUser({ email, password });
  const role = invitation.type === "school" ? "educator" : invitation.type;

  try {
    const user = await prisma.$transaction(async (tx) => {
      const newUser = await tx.users.create({
        data: {
          id: authUser.id,
          auth_provider_id: authUser.id,
          full_name,
          email,
          role,
        },
        select: SAFE_USER_FIELDS,
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
          where: {
            school_id: invitation.school_id,
            user_id: null,
          },
          orderBy: { created_at: "asc" },
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
  } catch (err) {
    await deleteSupabaseUserIfCreated(authUser.id);
    throw err;
  }
};

const validateInvitationCode = async (code) => {
  const invitation = await prisma.invitations.findUnique({
    where: { code },
    include: {
      schools: { select: { id: true, name: true } },
      olympiads: { select: { id: true, name: true } },
    },
  });

  if (!invitation) {
    throw new NotFoundError("Invalid invitation code");
  }
  if (invitation.used_by_id) {
    throw new BadRequestError("Invitation already used");
  }
  if (invitation.expires_at < new Date()) {
    throw new BadRequestError("Invitation expired");
  }

  return {
    valid: true,
    type: invitation.type,
    email: invitation.email || null,
    school: invitation.schools || null,
    olympiad: invitation.olympiads || null,
  };
};

const deleteAccount = async (userId) => {
  ensureSupabaseConfigured();

  await supabase.auth.admin.deleteUser(userId);
  await prisma.users.update({
    where: { id: userId },
    data: { deleted_at: new Date() },
  });
};

const inviteSchool = async ({
  schoolName,
  contactEmail,
  olympiadId,
  organiserId,
}) => {
  const olympiad = await prisma.olympiads.findFirst({
    where: {
      id: olympiadId,
      organiser_id: organiserId,
    },
    select: { id: true },
  });

  if (!olympiad) {
    throw new NotFoundError("Olympiad not found");
  }

  const code = generateInvitationCode("school");
  const expires_at = getInvitationExpiry("school");

  const result = await prisma.$transaction(async (tx) => {
    const school = await tx.schools.create({
      data: { name: schoolName },
    });

    const invitation = await tx.invitations.create({
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

    return { school, invitation };
  });

  return { ...result, code };
};

const inviteEducator = async ({ email, schoolId, olympiadId, createdById }) => {
  const registration = await prisma.school_registrations.findUnique({
    where: {
      school_id_olympiad_id: {
        school_id: schoolId,
        olympiad_id: olympiadId,
      },
    },
    select: { id: true },
  });

  if (!registration) {
    throw new NotFoundError("School is not registered for this olympiad");
  }

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

const generateStudentCodes = async ({
  count,
  schoolId,
  olympiadId,
  createdById,
}) => {
  const registration = await prisma.school_registrations.findUnique({
    where: {
      school_id_olympiad_id: {
        school_id: schoolId,
        olympiad_id: olympiadId,
      },
    },
    select: { id: true },
  });

  if (!registration) {
    throw new NotFoundError("School is not registered for this olympiad");
  }

  const codes = await prisma.$transaction(async (tx) => {
    const createdCodes = [];

    for (let i = 0; i < count; i += 1) {
      const code = generateInvitationCode("student");
      const entrant = await tx.entrants.create({
        data: {
          school_id: schoolId,
          full_name: "Pending Registration",
        },
      });

      await tx.invitations.create({
        data: {
          code,
          type: "student",
          school_id: schoolId,
          olympiad_id: olympiadId,
          created_by_id: createdById,
          expires_at: getInvitationExpiry("student"),
        },
      });

      createdCodes.push({ code, entrantId: entrant.id });
    }

    return createdCodes;
  });

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
