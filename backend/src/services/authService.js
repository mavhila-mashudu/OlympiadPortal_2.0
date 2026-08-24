// @ts-nocheck
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const prisma = require("../config/database").default;
const config = require("../config/env");
const {
  ConflictError,
  UnauthorizedError,
  BadRequestError,
  NotFoundError,
} = require("../errors/AppError");
const {
  generateAccessToken,
  generateRefreshToken,
  getRefreshTokenExpiry,
} = require("../utils/tokens");
const {
  generateInvitationCode,
  getInvitationExpiry,
} = require("../utils/invitations");

// ─────────────────────────────────────────
// ORGANISER REGISTRATION
// Gated by ORGANISER_SECRET — no invitation needed
// ─────────────────────────────────────────
const registerOrganiser = async ({
  full_name,
  email,
  password,
  organiserSecret,
}) => {
  // Verify the secret key
  if (organiserSecret !== config.auth.organiserSecret) {
    throw new UnauthorizedError("Invalid organiser secret");
  }

  // Check email not taken
  const existing = await prisma.users.findUnique({ where: { email } });
  if (existing) throw new ConflictError("Email already registered");

  const password_hash = await bcrypt.hash(password, 10);

  const user = await prisma.users.create({
    data: { full_name, email, password_hash, role: "organiser" },
    select: {
      id: true,
      full_name: true,
      email: true,
      role: true,
      created_at: true,
    },
  });

  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  await prisma.refresh_tokens.create({
    data: {
      token: refreshToken,
      user_id: user.id,
      expires_at: getRefreshTokenExpiry(),
    },
  });

  return { user, accessToken, refreshToken };
};

// ─────────────────────────────────────────
// VALIDATE INVITATION CODE
// Called before showing the registration form
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
    throw new BadRequestError("Invitation has expired");

  return {
    valid: true,
    type: invitation.type,
    school: invitation.schools || null,
    olympiad: invitation.olympiads || null,
  };
};

// ─────────────────────────────────────────
// REGISTER WITH INVITATION CODE
// For educators and students
// ─────────────────────────────────────────
const registerWithCode = async ({ full_name, email, password, code }) => {
  // Validate invitation
  const invitation = await prisma.invitations.findUnique({
    where: { code },
    include: {
      schools: true,
      olympiads: true,
    },
  });

  if (!invitation) throw new BadRequestError("Invalid invitation code");
  if (invitation.used_by_id) throw new ConflictError("Invitation already used");
  if (invitation.expires_at < new Date())
    throw new BadRequestError("Invitation has expired");

  // Check email not taken
  const existing = await prisma.users.findUnique({ where: { email } });
  if (existing) throw new ConflictError("Email already registered");

  const password_hash = await bcrypt.hash(password, 10);

  // Determine role from invitation type
  const role = invitation.type === "school" ? "educator" : invitation.type;

  // Create user + role-specific record in a transaction
  const result = await prisma.$transaction(async (tx) => {
    // Create the user
    const user = await tx.users.create({
      data: { full_name, email, password_hash, role },
      select: {
        id: true,
        full_name: true,
        email: true,
        role: true,
        created_at: true,
      },
    });

    // Create educator profile
    if (role === "educator") {
      await tx.educators.create({
        data: {
          user_id: user.id,
          school_id: invitation.school_id,
        },
      });

      // If school invite — also register school in olympiad
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

    // Create student profile (online student claiming their code)
    if (role === "student") {
      // Find the entrant record created when educator generated codes
      const entrant = await tx.entrants.findFirst({
        where: {
          school_id: invitation.school_id,
          user_id: null, // not yet claimed
        },
      });

      if (entrant) {
        await tx.entrants.update({
          where: { id: entrant.id },
          data: { user_id: user.id, full_name },
        });
      }
    }

    // Mark invitation as used
    await tx.invitations.update({
      where: { code },
      data: { used_by_id: user.id },
    });

    return user;
  });

  const accessToken = generateAccessToken(result);
  const refreshToken = generateRefreshToken(result);

  await prisma.refresh_tokens.create({
    data: {
      token: refreshToken,
      user_id: result.id,
      expires_at: getRefreshTokenExpiry(),
    },
  });

  return { user: result, accessToken, refreshToken };
};

// ─────────────────────────────────────────
// LOGIN
// ─────────────────────────────────────────
const login = async ({ email, password }) => {
  // Find user — must not be soft deleted
  const user = await prisma.users.findFirst({
    where: {
      email,
      deleted_at: null,
    },
    include: {
      educators: { select: { school_id: true } },
      entrants: { select: { school_id: true } },
    },
  });

  // Same error for wrong email or wrong password
  // Never reveal which one — prevents user enumeration
  if (!user || !user.password_hash) {
    throw new UnauthorizedError("Invalid credentials");
  }

  const isValid = await bcrypt.compare(password, user.password_hash);
  if (!isValid) throw new UnauthorizedError("Invalid credentials");

  const safeUser = {
    id: user.id,
    full_name: user.full_name,
    email: user.email,
    role: user.role,
    educators: user.educators,
    entrants: user.entrants,
    created_at: user.created_at,
  };

  const accessToken = generateAccessToken(safeUser);
  const refreshToken = generateRefreshToken(safeUser);

  await prisma.refresh_tokens.create({
    data: {
      token: refreshToken,
      user_id: user.id,
      expires_at: getRefreshTokenExpiry(),
    },
  });

  return { user: safeUser, accessToken, refreshToken };
};

// ─────────────────────────────────────────
// DEV LOGIN (TEMPORARY)
// Bypasses password entirely — finds or creates a user by
// email only, matching the CURRENT live `users` table (which
// no longer has password_hash / refresh_tokens columns).
// select is explicit here — Prisma otherwise tries to fetch
// EVERY field declared in schema.prisma (including
// password_hash), which doesn't exist on the real table.
// Remove this once real auth is settled with the team.
// ─────────────────────────────────────────
const SAFE_USER_FIELDS = {
  id: true,
  email: true,
  full_name: true,
  role: true,
  created_at: true,
};

const devLogin = async ({ email, full_name, role }) => {
  const safeRole = ["organiser", "educator", "student"].includes(role)
    ? role
    : "organiser";

  let user = await prisma.users.findFirst({
    where: { email, deleted_at: null },
    select: SAFE_USER_FIELDS,
  });

  if (!user) {
    user = await prisma.users.create({
      data: {
        id: crypto.randomUUID(),
        email,
        full_name: full_name || email.split("@")[0],
        role: safeRole,
      },
      select: SAFE_USER_FIELDS,
    });
  }

  const accessToken = generateAccessToken(user);

  return { user, accessToken };
};

// ─────────────────────────────────────────
// REFRESH TOKEN
// ─────────────────────────────────────────
const refresh = async (token) => {
  if (!token) throw new UnauthorizedError("No refresh token");

  const stored = await prisma.refresh_tokens.findUnique({
    where: { token },
    include: { users: true },
  });

  if (!stored || stored.expires_at < new Date()) {
    throw new UnauthorizedError("Invalid or expired refresh token");
  }

  const jwt = require("jsonwebtoken");
  try {
    jwt.verify(token, config.auth.refreshSecret);
  } catch {
    throw new UnauthorizedError("Invalid refresh token");
  }

  const accessToken = generateAccessToken(stored.users);
  return { accessToken };
};

// ─────────────────────────────────────────
// LOGOUT
// ─────────────────────────────────────────
const logout = async (token) => {
  if (!token) return;
  await prisma.refresh_tokens.deleteMany({ where: { token } });
};

// ─────────────────────────────────────────
// FORGOT PASSWORD
// ─────────────────────────────────────────
const forgotPassword = async (email) => {
  const user = await prisma.users.findFirst({
    where: { email, deleted_at: null },
  });

  // Always return success — never reveal if email exists
  if (!user) return;

  const rawToken = crypto.randomBytes(32).toString("hex");
  const hashedToken = crypto
    .createHash("sha256")
    .update(rawToken)
    .digest("hex");

  const expires = new Date();
  expires.setHours(expires.getHours() + 1); // 1 hour

  await prisma.users.update({
    where: { id: user.id },
    data: {
      password_reset_token: hashedToken,
      password_reset_expires: expires,
    },
  });

  // TODO: send email with rawToken
  // For now return it so you can test in Postman
  return rawToken;
};

// ─────────────────────────────────────────
// RESET PASSWORD
// ─────────────────────────────────────────
const resetPassword = async (rawToken, newPassword) => {
  const hashedToken = crypto
    .createHash("sha256")
    .update(rawToken)
    .digest("hex");

  const user = await prisma.users.findFirst({
    where: {
      password_reset_token: hashedToken,
      password_reset_expires: { gt: new Date() },
      deleted_at: null,
    },
  });

  if (!user) throw new BadRequestError("Invalid or expired reset token");

  const password_hash = await bcrypt.hash(newPassword, 10);

  await prisma.users.update({
    where: { id: user.id },
    data: {
      password_hash,
      password_reset_token: null,
      password_reset_expires: null,
    },
  });

  // Invalidate all refresh tokens — force re-login
  await prisma.refresh_tokens.deleteMany({ where: { user_id: user.id } });
};

// ─────────────────────────────────────────
// DELETE ACCOUNT (soft delete)
// ─────────────────────────────────────────
const deleteAccount = async (userId) => {
  await prisma.users.update({
    where: { id: userId },
    data: { deleted_at: new Date() },
  });

  // Invalidate all sessions
  await prisma.refresh_tokens.deleteMany({ where: { user_id: userId } });
};

// ─────────────────────────────────────────
// GENERATE SCHOOL INVITATION
// Called by organiser when inviting a school
// ─────────────────────────────────────────
const inviteSchool = async ({
  schoolName,
  contactEmail,
  olympiadId,
  organiserId,
}) => {
  // Create the school record
  const school = await prisma.schools.create({
    data: { name: schoolName },
  });

  // Generate invitation code
  const code = generateInvitationCode("school");

  const invitation = await prisma.invitations.create({
    data: {
      code,
      type: "school",
      olympiad_id: olympiadId,
      school_id: school.id,
      email: contactEmail,
      created_by_id: organiserId,
      expires_at: getInvitationExpiry("school"),
    },
  });

  // TODO: send email to contactEmail with the code
  return { school, invitation, code };
};

// ─────────────────────────────────────────
// GENERATE EDUCATOR INVITATION
// Called by existing educator to invite colleague
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
// GENERATE STUDENT CODES IN BULK
// Called by educator — generates N codes at once
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

    // Create placeholder entrant (no user yet)
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
  validateInvitationCode,
  registerWithCode,
  login,
  devLogin,
  refresh,
  logout,
  forgotPassword,
  resetPassword,
  deleteAccount,
  inviteSchool,
  inviteEducator,
  generateStudentCodes,
};