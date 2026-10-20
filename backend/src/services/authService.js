// @ts-nocheck
const prisma = require('../config/database').default;
const supabase = require('../config/supabase');
const {
    AppError,
    ConflictError,
    BadRequestError,
    ForbiddenError,
    NotFoundError,
} = require('../errors/AppError');
const { forgetCachedToken, forgetCachedUser } = require('../middlewares/auth');
const schoolInvitations = require('./schoolInvitationService');
const accountNotices = require('./accountNotificationService');

const SAFE_USER_FIELDS = {
    id: true,
    full_name: true,
    email: true,
    role: true,
    created_at: true,
};

const ensureSupabaseConfigured = () => {
    if (!supabase) {
        throw new BadRequestError('Supabase is not configured on the server');
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
        throw new ConflictError('Email already registered');
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
        if (!school) throw new NotFoundError('School not found');
        return school.id;
    }

    const name = (schoolName || '').trim();
    if (!name) throw new BadRequestError('School is required');
    if (!allowCreate) {
        throw new BadRequestError('Select your school from the list');
    }

    // Matching case-insensitively keeps "Parktown Boys High" from becoming two
    // separate schools because two educators capitalised it differently.
    const existing = await tx.schools.findFirst({
        where: { name: { equals: name, mode: 'insensitive' } },
        select: { id: true },
    });
    if (existing) return existing.id;

    const created = await tx.schools.create({ data: { name } });
    return created.id;
};

/**
 * Creates an account of any role. Not exported: the public `register` below
 * only allows educators and students, and organisers are provisioned through
 * `registerOrganiser` (see scripts/createOrganiser.js), never by self-service.
 * Organisers need nothing beyond their details; educators and students name
 * the school they belong to.
 */
const createAccount = async ({
    full_name,
    email,
    password,
    role,
    school_id,
    school_name,
    invitation_code,
}) => {
    if (!['organiser', 'educator', 'student'].includes(role)) {
        throw new BadRequestError('Unknown account type');
    }

    await assertEmailAvailable(email);

    // A valid invitation code (sent to this very email address) is the one thing
    // that skips the approval queue. It also decides the school, so whatever
    // school the form sent is ignored. A bad code is an error, never a quiet
    // fall-back to pending: the person can sign up again without a code.
    let invitation = null;
    if (invitation_code) {
        invitation = await schoolInvitations.findUsableInvitation(
            invitation_code,
            email,
            role
        );
        school_id = invitation.school_id;
        school_name = undefined;
    }

    // A student may only join a school that already exists, so that a typo does
    // not strand them in a school of one with no educator to register them.
    if (role === 'student' && !school_id && !invitation) {
        throw new BadRequestError('Select your school from the list');
    }
    if (role === 'educator' && !school_id && !(school_name || '').trim()) {
        throw new BadRequestError('Select your school, or enter its name');
    }


    // Validate the school before creating a Supabase account.
    if (school_id) {
        const uuidPattern =
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

        if (typeof school_id !== 'string' ||
            !uuidPattern.test(school_id)) {
            throw new BadRequestError(
                'Invalid school selection. Please select your school again.'
            );
        }

        const schoolExists = await prisma.schools.findUnique({
            where: { id: school_id },
            select: { id: true },
        });

        if (!schoolExists) {
            throw new BadRequestError(
                'The selected school no longer exists. Please select another.'
            );
        }
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

            if (role === 'organiser') return newUser;

            const schoolId = await resolveSchool(tx, {
                schoolId: school_id,
                schoolName: school_name,
                allowCreate: role === 'educator',
            });

            if (role === 'educator') {
                await tx.educators.create({
                    data: { user_id: newUser.id, school_id: schoolId },
                });

                if (invitation) {
                    await schoolInvitations.consumeInvitation(
                        tx,
                        invitation.id,
                        newUser.id
                    );
                }

                // The first applicant proposes becoming coordinator, but has no
                // privileges until a trusted organiser approves the membership.
                // Other applicants must likewise await the school's coordinator.
                const existingCoordinator =
                    await tx.school_memberships.findFirst({
                        where: {
                            school_id: schoolId,
                            role: 'coordinator',
                            status: 'active',
                        },
                        select: { id: true },
                    });

                // An invited educator is active at once, as coordinator only if
                // the invitation said so and the school still has none; the
                // database allows just one active coordinator per school.
                // Anyone else joins pending, as before.
                const membershipRole = existingCoordinator
                    ? 'educator'
                    : invitation && invitation.role === 'educator'
                      ? 'educator'
                      : 'coordinator';
                await tx.school_memberships.create({
                    data: {
                        user_id: newUser.id,
                        school_id: schoolId,
                        role: membershipRole,
                        status: invitation ? 'active' : 'pending',
                    },
                });
                if (invitation) {
                    await accountNotices.notifyInvitationAccepted(tx, {
                        invitationId: invitation.id,
                        invitedById: invitation.invited_by_id,
                        userId: newUser.id, name: full_name, type: 'educator',
                    });
                } else {
                    await accountNotices.notifyPendingSignup(tx, {
                        userId: newUser.id, name: full_name, schoolId, type: 'educator',
                    });
                }
            }

            if (role === 'student') {
                // With a valid, email-bound student code, a NEW entrant becomes
                // active. Never link a legacy entrant by name alone. Without a
                // code the coordinator must still approve/verify the account.
                await tx.entrants.create({
                    data: {
                        user_id: newUser.id,
                        school_id: schoolId,
                        full_name,
                        status: invitation ? 'active' : 'pending',
                    },
                });
                if (invitation) {
                    await schoolInvitations.consumeInvitation(
                        tx,
                        invitation.id,
                        newUser.id
                    );
                    await accountNotices.notifyInvitationAccepted(tx, {
                        invitationId: invitation.id,
                        invitedById: invitation.invited_by_id,
                        userId: newUser.id, name: full_name, type: 'student',
                    });
                } else {
                    await accountNotices.notifyPendingSignup(tx, {
                        userId: newUser.id, name: full_name, schoolId, type: 'student',
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

/**
 * Public self-service sign-up: educators and students only. Organisers hold
 * authority over every olympiad, so nobody can claim that role by asking for it.
 */
const register = async (details) => {
    if (details.role === 'organiser') {
        throw new ForbiddenError(
            'Organiser accounts are created by the portal administrator'
        );
    }
    return createAccount(details);
};

/**
 * Creates an organiser. Trusted callers only (the provisioning script); it is
 * deliberately not reachable from any HTTP route.
 */
const registerOrganiser = async ({ full_name, email, password }) =>
    createAccount({ full_name, email, password, role: 'organiser' });

/** The schools offered on the signup form and in the invite pickers. */
const listSchools = async () => {
    const schools = await prisma.schools.findMany({
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
    });
    return schools;
};

// Ends this session on the server. Supabase revokes it, so it can't be
// refreshed or used again, and its cached sign-in here is dropped at once,
// rather than lasting up to the cache's 30 seconds. The browser forgets the
// token either way, so a Supabase failure is logged, not returned.
const logout = async (token) => {
    forgetCachedToken(token);
    ensureSupabaseConfigured();
    const { error } = await supabase.auth.admin.signOut(token, 'local');
    if (error)
        console.warn(
            `[auth] Supabase could not end the session: ${error.message}`
        );
};

// Deleting an account removes the login and the person's details, but keeps
// the records others rely on (results, marks, reviews, audit history), now
// attached to an anonymous "Deleted user". The email is freed, so the person
// can register again.
const deleteAccount = async (userId) => {
    ensureSupabaseConfigured();

    const user = await prisma.users.findUnique({
        where: { id: userId },
        select: { role: true },
    });
    if (!user) throw new NotFoundError('Account not found');

    // Nobody else can manage an organiser's olympiads, so an organiser can't
    // leave while one of them is still running
    if (user.role === 'organiser') {
        const running = await prisma.olympiads.findFirst({
            where: {
                organiser_id: userId,
                rounds: { some: { state: { not: 'results_released' } } },
            },
            select: { name: true },
        });
        if (running) {
            throw new ConflictError(
                `You can’t delete your account while “${running.name}” is still running. Release the results of all its rounds first.`
            );
        }
    }

    await prisma.$transaction(async (tx) => {
        await tx.users.update({
            where: { id: userId },
            data: {
                deleted_at: new Date(),
                email: `deleted-${userId}@deleted.invalid`,
                full_name: 'Deleted user',
                auth_provider_id: null,
            },
        });
        // No longer a member of their school, and a learner's record (which
        // belongs to the school) is no longer tied to a login
        await tx.school_memberships.updateMany({
            where: { user_id: userId },
            data: { status: 'removed' },
        });
        await tx.entrants.updateMany({
            where: { user_id: userId },
            data: { user_id: null },
        });

    });

    // Supabase is a separate service and cannot participate in the database
    // transaction. Delete the login after committing the anonymisation rather
    // than holding database locks open during a network request.
    const { error } = await supabase.auth.admin.deleteUser(userId);
    if (error && error.status !== 404) {
        // Auth may complete deletion but return an error while producing its
        // response. Verify the final state before reporting a failure.
        const { data, error: lookupError } =
            await supabase.auth.admin.getUserById(userId);
        const authUserIsGone =
            lookupError?.status === 404 || (!lookupError && !data?.user);
        if (!authUserIsGone) {
            throw new AppError(
                'We couldn’t delete your account. Please try again.',
                502
            );
        }
    }
    forgetCachedUser(userId);
};

const listEducatorOlympiads = async (schoolId) => {
    const registrations = await prisma.school_registrations.findMany({
        where: { school_id: schoolId, status: 'approved' },
        select: { olympiads: { select: { id: true, name: true } } },
        orderBy: { registered_at: 'desc' },
    });
    return registrations.map((registration) => registration.olympiads);
};

module.exports = {
    register,
    registerOrganiser,
    listSchools,
    logout,
    deleteAccount,
    listEducatorOlympiads,
};
