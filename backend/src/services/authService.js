// @ts-nocheck
const prisma = require("../config/database").default;
const supabase = require("../config/supabase");
const {
  ConflictError,
  BadRequestError,
  NotFoundError,
} = require("../errors/AppError");
const { forgetCachedUser } = require("../middlewares/auth");

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

const assertEmailAvailable = async (email) => {
  const existing = await prisma.users.findUnique({
    where: { email },
    select: { id: true },
  });
  if (existing) {
    throw new ConflictError("Email already registered");
  }
};

// Educators and students both belong to a school. The signup form offers the
// existing schools to pick from; an educator whose school is not listed yet
// may name a new one, which is created on the spot.
const resolveSchool = async (tx, { schoolId, schoolName, allowCreate }) => {
  if (schoolId) {
    const school = await tx.schools.findUnique({
      where: { id: schoolId },
      select: { id: true },
    });
    if (!school) throw new NotFoundError("School not found");
    return school.id;
  }

  const name = (schoolName || "").trim();
  if (!name) throw new BadRequestError("School is required");
  if (!allowCreate) {
    throw new BadRequestError("Select your school from the list");
  }

  // Matching case-insensitively keeps "Parktown Boys High" from becoming two
  // separate schools because two educators capitalised it differently.
  const existing = await tx.schools.findFirst({
    where: { name: { equals: name, mode: "insensitive" } },
    select: { id: true },
  });
  if (existing) return existing.id;

  const created = await tx.schools.create({ data: { name } });
  return created.id;
};

/**
 * Registers any of the three roles. Organisers need nothing beyond their
 * details; educators and students name the school they belong to.
 */
const register = async ({ full_name, email, password, role, school_id, school_name }) => {
  if (!["organiser", "educator", "student"].includes(role)) {
    throw new BadRequestError("Unknown account type");
  }

  await assertEmailAvailable(email);

  // A student may only join a school that already exists, so that a typo does
  // not strand them in a school of one with no educator to register them.
  if (role === "student" && !school_id) {
    throw new BadRequestError("Select your school from the list");
  }
  if (role === "educator" && !school_id && !(school_name || "").trim()) {
    throw new BadRequestError("Select your school, or enter its name");
  }

  const authUser = await createSupabaseUser({ email, password });

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

      if (role === "organiser") return newUser;

      const schoolId = await resolveSchool(tx, {
        schoolId: school_id,
        schoolName: school_name,
        allowCreate: role === "educator",
      });

      if (role === "educator") {
        await tx.educators.create({
          data: { user_id: newUser.id, school_id: schoolId },
        });

        // Whoever brings a school onto the platform coordinates it; educators
        // who join an established school get the ordinary member role.
        const existingCoordinator = await tx.school_memberships.findFirst({
          where: { school_id: schoolId, role: "coordinator", status: "active" },
          select: { id: true },
        });

        await tx.school_memberships.create({
          data: {
            user_id: newUser.id,
            school_id: schoolId,
            role: existingCoordinator ? "educator" : "coordinator",
          },
        });
      }

      if (role === "student") {
        // An educator may have already listed this student by name when
        // uploading their entrants; claim that row rather than duplicating it.
        const entrant = await tx.entrants.findFirst({
          where: { school_id: schoolId, user_id: null, full_name },
          orderBy: { created_at: "asc" },
        });

        if (entrant) {
          await tx.entrants.update({
            where: { id: entrant.id },
            data: { user_id: newUser.id },
          });
        } else {
          await tx.entrants.create({
            data: { user_id: newUser.id, school_id: schoolId, full_name },
          });
        }
      }

      return newUser;
    });

    return { user };
  } catch (err) {
    await deleteSupabaseUserIfCreated(authUser.id);
    throw err;
  }
};

const registerOrganiser = async ({ full_name, email, password }) =>
  register({ full_name, email, password, role: "organiser" });

/** The schools offered on the signup form and in the invite pickers. */
const listSchools = async () => {
  const schools = await prisma.schools.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return schools;
};

const deleteAccount = async (userId) => {
  ensureSupabaseConfigured();

  await supabase.auth.admin.deleteUser(userId);
  await prisma.users.update({
    where: { id: userId },
    data: { deleted_at: new Date() },
  });
  forgetCachedUser(userId);
};

const listEducatorOlympiads = async (schoolId) => {
  const registrations = await prisma.school_registrations.findMany({
    where: { school_id: schoolId, status: "approved" },
    select: { olympiads: { select: { id: true, name: true } } },
    orderBy: { registered_at: "desc" },
  });
  return registrations.map((registration) => registration.olympiads);
};

module.exports = {
  register,
  registerOrganiser,
  listSchools,
  deleteAccount,
  listEducatorOlympiads,
};
