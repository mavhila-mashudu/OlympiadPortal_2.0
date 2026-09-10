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
  generateInviteToken,
  hashInviteToken,
} = require("../utils/invitations");
const { sendSchoolInviteEmail, sendStudentInviteEmail, sendEducatorInviteEmail } = require("../lib/mailer");

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

const registerWithCode = async ({ full_name, email, password, code, invite_token }) => {
  const invitationLookup = invite_token
    ? { token_hash: hashInviteToken(invite_token) }
    : { code };
  const invitation = await prisma.invitations.findUnique({
    where: invitationLookup,
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
  if (invitation.type === "school" && !invitation.school_id && !invitation.school_name) {
    throw new BadRequestError("School invitation is missing a school name");
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
      let schoolId = invitation.school_id;

      // A pending school invite has no school record until the recipient
      // successfully registers with the invitation code.
      if (invitation.type === "school" && !schoolId) {
        const school = await tx.schools.create({
          data: { name: invitation.school_name },
        });
        schoolId = school.id;

        await tx.school_registrations.create({
          data: { school_id: schoolId, olympiad_id: invitation.olympiad_id, status: "approved" },
        });
      }

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
            school_id: schoolId,
          },
        });

        await tx.school_memberships.upsert({
          where: { user_id_school_id: { user_id: newUser.id, school_id: schoolId } },
          update: { status: "active", role: invitation.intended_school_role || "educator" },
          create: {
            user_id: newUser.id,
            school_id: schoolId,
            role: invitation.intended_school_role || "educator",
          },
        });

        if (invitation.type === "school" && invitation.olympiad_id) {
          await tx.school_registrations.upsert({
            where: {
              school_id_olympiad_id: {
                school_id: schoolId,
                olympiad_id: invitation.olympiad_id,
              },
            },
            update: {},
            create: {
              school_id: schoolId,
              olympiad_id: invitation.olympiad_id,
            },
          });
        }
      }

      if (role === "student") {
        const entrant = await tx.entrants.findFirst({
          where: {
            school_id: schoolId,
            user_id: null,
          },
          orderBy: { created_at: "asc" },
        });

        if (entrant) {
          await tx.entrants.update({
            where: { id: entrant.id },
            data: { user_id: newUser.id, full_name },
          });
        } else {
          await tx.entrants.create({
            data: {
              user_id: newUser.id,
              school_id: schoolId,
              full_name,
            },
          });
        }
      }

      await tx.invitations.update({
        where: { id: invitation.id },
        data: { used_by_id: newUser.id, accepted_at: new Date() },
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
    select: { id: true, name: true },
  });

  if (!olympiad) {
    throw new NotFoundError("Olympiad not found");
  }

  // A unique constraint protects against the (very unlikely) random-code
  // collision; retrying keeps the organiser workflow seamless if it occurs.
  let result;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateInvitationCode("school");
    const inviteToken = generateInviteToken();
    try {
      result = await prisma.$transaction(async (tx) => {
        const invitation = await tx.invitations.create({
          data: {
            code,
            token_hash: hashInviteToken(inviteToken),
            type: "school",
            intended_school_role: "coordinator",
            school_name: schoolName,
            olympiad_id: olympiadId,
            email: contactEmail,
            created_by_id: organiserId,
            expires_at: getInvitationExpiry("school"),
          },
        });

        return { invitation, inviteToken };
      });
      break;
    } catch (err) {
      // Prisma P2002 is its unique-constraint error code. The transaction has
      // already rolled back, so it is safe to try a fresh code.
      if (err.code !== "P2002" || attempt === 4) throw err;
    }
  }

  const registrationUrl = new URL("/register", config.frontend.url);
  registrationUrl.searchParams.set("token", result.inviteToken);

  const email = await sendSchoolInviteEmail({
    to: contactEmail,
    schoolName,
    olympiadName: olympiad.name,
    inviteCode: result.invitation.code,
    registrationUrl: registrationUrl.toString(),
  });

  return {
    invitation: result.invitation,
    code: result.invitation.code,
    registrationUrl: registrationUrl.toString(),
    emailDelivered: email.delivered,
  };
};

const validateInvitationToken = async (token) => {
  const invitation = await prisma.invitations.findUnique({
    where: { token_hash: hashInviteToken(token) },
    include: {
      schools: { select: { id: true, name: true } },
      olympiads: { select: { id: true, name: true } },
    },
  });

  if (!invitation || invitation.used_by_id || invitation.expires_at < new Date()) {
    throw new NotFoundError("This invitation link is invalid, expired, or has already been used");
  }

  return {
    valid: true,
    type: invitation.type,
    email: invitation.email || null,
    school: invitation.schools || (invitation.school_name ? { name: invitation.school_name } : null),
    olympiad: invitation.olympiads || null,
  };
};

const inviteEducator = async ({ email, schoolId, olympiadId, createdById }) => {
  const registration = await prisma.school_registrations.findUnique({
    where: {
      school_id_olympiad_id: {
        school_id: schoolId,
        olympiad_id: olympiadId,
      },
    },
    include: { olympiads: { select: { name: true } } },
  });

  if (!registration) {
    throw new NotFoundError("School is not registered for this olympiad");
  }

  const code = generateInvitationCode("educator");
  const inviteToken = generateInviteToken();
  const invitation = await prisma.invitations.create({
    data: {
      code,
      token_hash: hashInviteToken(inviteToken),
      type: "educator",
      intended_school_role: "educator",
      school_id: schoolId,
      olympiad_id: olympiadId,
      email,
      created_by_id: createdById,
      expires_at: getInvitationExpiry("educator"),
    },
  });

  const registrationUrl = new URL("/register", config.frontend.url);
  registrationUrl.searchParams.set("token", inviteToken);
  const delivery = await sendEducatorInviteEmail({
    to: email,
    olympiadName: registration.olympiads.name,
    inviteCode: code,
    registrationUrl: registrationUrl.toString(),
  });
  return { invitation, code, registrationUrl: registrationUrl.toString(), emailDelivered: delivery.delivered };
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
      await tx.invitations.create({
        data: {
          code,
          token_hash: hashInviteToken(generateInviteToken()),
          type: "student",
          school_id: schoolId,
          olympiad_id: olympiadId,
          created_by_id: createdById,
          expires_at: getInvitationExpiry("student"),
        },
      });

      createdCodes.push({ code });
    }

    return createdCodes;
  });

  return codes;
};

const listEducatorOlympiads = async (schoolId) => {
  const registrations = await prisma.school_registrations.findMany({
    where: { school_id: schoolId, status: "approved" },
    select: { olympiads: { select: { id: true, name: true } } },
    orderBy: { registered_at: "desc" },
  });
  return registrations.map((registration) => registration.olympiads);
};

const inviteStudent = async ({ email, schoolId, olympiadId, createdById }) => {
  const registration = await prisma.school_registrations.findUnique({
    where: { school_id_olympiad_id: { school_id: schoolId, olympiad_id: olympiadId } },
    include: { olympiads: { select: { name: true } } },
  });

  if (!registration) {
    throw new NotFoundError("Your school is not registered for this olympiad");
  }

  let invitation;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const inviteToken = generateInviteToken();
      invitation = await prisma.invitations.create({
        data: {
          code: generateInvitationCode("student"),
          token_hash: hashInviteToken(inviteToken),
          type: "student",
          school_id: schoolId,
          olympiad_id: olympiadId,
          email,
          created_by_id: createdById,
          expires_at: getInvitationExpiry("student"),
        },
      });
      invitation.inviteToken = inviteToken;
      break;
    } catch (err) {
      if (err.code !== "P2002" || attempt === 4) throw err;
    }
  }

  const registrationUrl = new URL("/register", config.frontend.url);
  registrationUrl.searchParams.set("token", invitation.inviteToken);
  const delivery = await sendStudentInviteEmail({
    to: email,
    olympiadName: registration.olympiads.name,
    inviteCode: invitation.code,
    registrationUrl: registrationUrl.toString(),
  });

  return {
    invitation,
    code: invitation.code,
    registrationUrl: registrationUrl.toString(),
    emailDelivered: delivery.delivered,
  };
};

const listStudentInvitations = async (schoolId) => {
  const invitations = await prisma.invitations.findMany({
    where: { school_id: schoolId, type: "student" },
    include: { olympiads: { select: { name: true } } },
    orderBy: { created_at: "desc" },
  });
  const now = new Date();
  return invitations.map((invitation) => ({
    id: invitation.id,
    email: invitation.email,
    olympiadName: invitation.olympiads?.name || "Olympiad",
    code: invitation.code,
    status: invitation.used_by_id
      ? "accepted"
      : invitation.expires_at < now
        ? "expired"
        : "pending",
  }));
};

module.exports = {
  registerOrganiser,
  registerWithCode,
  validateInvitationCode,
  validateInvitationToken,
  deleteAccount,
  inviteSchool,
  inviteEducator,
  generateStudentCodes,
  listEducatorOlympiads,
  inviteStudent,
  listStudentInvitations,
};
