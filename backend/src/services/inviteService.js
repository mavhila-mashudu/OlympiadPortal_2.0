// @ts-nocheck
// In-app olympiad invitations. Signing up no longer needs an invitation code,
// so an invite is purely a request sent to someone who is already on the
// platform: it shows up on their dashboard and they accept or reject it.
//
//  - an organiser invites an educator, and accepting registers that educator's
//    school for the olympiad;
//  - an educator invites a student from their own school, and accepting
//    enters that student into the olympiad's rounds.
const prisma = require('../config/database').default;
const {
    BadRequestError,
    ConflictError,
    ForbiddenError,
    NotFoundError,
} = require('../errors/AppError');

// Rounds that still take new entrants; mirrors educatorService.
const REGISTRABLE_STATES = new Set(['scheduled', 'open']);

const INVITE_VIEW = {
    id: true,
    role: true,
    status: true,
    message: true,
    created_at: true,
    responded_at: true,
    olympiads: { select: { id: true, name: true } },
    schools: { select: { id: true, name: true } },
    invitee: { select: { id: true, full_name: true, email: true } },
    invited_by: { select: { id: true, full_name: true, email: true } },
};

const toInvite = (row) => ({
    id: row.id,
    role: row.role,
    status: row.status,
    message: row.message,
    createdAt: row.created_at,
    respondedAt: row.responded_at,
    olympiad: row.olympiads,
    school: row.schools,
    invitee: row.invitee
        ? {
              id: row.invitee.id,
              name: row.invitee.full_name,
              email: row.invitee.email,
          }
        : null,
    invitedBy: row.invited_by
        ? {
              id: row.invited_by.id,
              name: row.invited_by.full_name,
              email: row.invited_by.email,
          }
        : null,
});

const resolveEducatorSchool = async (userId) => {
    const educator = await prisma.educators.findUnique({
        where: { user_id: userId },
        select: { id: true, school_id: true },
    });
    if (!educator) throw new ForbiddenError('Educator profile not found');
    return educator;
};

// -----------------------------------------
// Reading invites
// -----------------------------------------

/** Every invite addressed to me - the dashboard's notification list. */
const listMyInvites = async (userId) => {
    const rows = await prisma.olympiad_invites.findMany({
        where: { invitee_id: userId },
        select: INVITE_VIEW,
        orderBy: [{ status: 'asc' }, { created_at: 'desc' }],
    });
    return rows.map(toInvite);
};

/** Invites an organiser sent for one of their olympiads. */
const listOlympiadInvites = async (olympiadId, organiserId) => {
    const olympiad = await prisma.olympiads.findFirst({
        where: { id: olympiadId, organiser_id: organiserId },
        select: { id: true },
    });
    if (!olympiad) throw new NotFoundError('Olympiad not found');

    const rows = await prisma.olympiad_invites.findMany({
        where: { olympiad_id: olympiadId },
        select: INVITE_VIEW,
        orderBy: { created_at: 'desc' },
    });
    return rows.map(toInvite);
};

/** Invites an educator sent to the students of their school. */
const listSchoolStudentInvites = async (userId) => {
    const educator = await resolveEducatorSchool(userId);

    const rows = await prisma.olympiad_invites.findMany({
        where: { school_id: educator.school_id, role: 'student' },
        select: INVITE_VIEW,
        orderBy: { created_at: 'desc' },
    });
    return rows.map(toInvite);
};

/**
 * The people an inviter may choose from: educators on the platform for an
 * organiser, and the school's own students for an educator. Anyone who
 * already has an invite for this olympiad is left out.
 */
const listInviteCandidates = async ({ olympiadId, userId, role }) => {
    const existing = await prisma.olympiad_invites.findMany({
        where: { olympiad_id: olympiadId },
        select: { invitee_id: true },
    });
    const invited = new Set(existing.map((row) => row.invitee_id));

    if (role === 'organiser') {
        const olympiad = await prisma.olympiads.findFirst({
            where: { id: olympiadId, organiser_id: userId },
            select: { id: true },
        });
        if (!olympiad) throw new NotFoundError('Olympiad not found');

        const educators = await prisma.users.findMany({
            where: { role: 'educator', deleted_at: null },
            select: {
                id: true,
                full_name: true,
                email: true,
                educators: {
                    select: { schools: { select: { id: true, name: true } } },
                },
            },
            orderBy: { full_name: 'asc' },
        });

        return educators
            .filter((user) => !invited.has(user.id) && user.educators)
            .map((user) => ({
                id: user.id,
                name: user.full_name,
                email: user.email,
                school: user.educators.schools,
            }));
    }

    const educator = await resolveEducatorSchool(userId);
    const students = await prisma.entrants.findMany({
        where: { school_id: educator.school_id, user_id: { not: null } },
        select: {
            users: {
                select: {
                    id: true,
                    full_name: true,
                    email: true,
                    deleted_at: true,
                },
            },
            schools: { select: { id: true, name: true } },
        },
        orderBy: { full_name: 'asc' },
    });

    return students
        .filter(
            (row) =>
                row.users && !row.users.deleted_at && !invited.has(row.users.id)
        )
        .map((row) => ({
            id: row.users.id,
            name: row.users.full_name,
            email: row.users.email,
            school: row.schools,
        }));
};

// -----------------------------------------
// Sending invites
// -----------------------------------------

const createInvite = async ({
    olympiadId,
    inviteeId,
    message,
    inviterId,
    inviterRole,
}) => {
    const invitee = await prisma.users.findUnique({
        where: { id: inviteeId },
        select: {
            id: true,
            role: true,
            deleted_at: true,
            educators: { select: { school_id: true } },
            entrants: { select: { school_id: true } },
        },
    });

    if (!invitee || invitee.deleted_at) {
        throw new NotFoundError('That person is not on the platform');
    }
    if (invitee.role === 'organiser') {
        throw new BadRequestError(
            'Organisers run their own olympiads and cannot be invited to one'
        );
    }

    const olympiad = await prisma.olympiads.findUnique({
        where: { id: olympiadId },
        select: { id: true, organiser_id: true, name: true },
    });
    if (!olympiad) throw new NotFoundError('Olympiad not found');

    let schoolId;

    if (inviterRole === 'organiser') {
        if (olympiad.organiser_id !== inviterId) {
            throw new ForbiddenError(
                'You can only invite people to your own olympiads'
            );
        }
        if (invitee.role !== 'educator') {
            throw new BadRequestError(
                'Organisers invite educators; educators invite their students'
            );
        }
        schoolId = invitee.educators?.school_id || null;
        if (!schoolId)
            throw new BadRequestError(
                'That educator is not attached to a school'
            );
    } else {
        const educator = await resolveEducatorSchool(inviterId);
        if (invitee.role !== 'student') {
            throw new BadRequestError('Educators may only invite students');
        }
        schoolId = invitee.entrants?.school_id || null;
        if (schoolId !== educator.school_id) {
            throw new ForbiddenError('That student is not at your school');
        }

        // An educator cannot hand out a place in an olympiad their school is not
        // taking part in.
        const registration = await prisma.school_registrations.findUnique({
            where: {
                school_id_olympiad_id: {
                    school_id: schoolId,
                    olympiad_id: olympiadId,
                },
            },
            select: { status: true },
        });
        if (!registration || registration.status !== 'approved') {
            throw new ForbiddenError(
                'Your school is not registered for this olympiad'
            );
        }
    }

    try {
        const invite = await prisma.olympiad_invites.create({
            data: {
                olympiad_id: olympiadId,
                school_id: schoolId,
                invitee_id: inviteeId,
                invited_by_id: inviterId,
                role: invitee.role,
                message: message?.trim() || null,
            },
            select: INVITE_VIEW,
        });
        return toInvite(invite);
    } catch (err) {
        // Prisma P2002 is its unique-constraint code: one invite per person per
        // olympiad.
        if (err.code === 'P2002') {
            throw new ConflictError(
                'That person has already been invited to this olympiad'
            );
        }
        throw err;
    }
};

const cancelInvite = async ({ inviteId, userId }) => {
    const invite = await prisma.olympiad_invites.findUnique({
        where: { id: inviteId },
        select: { id: true, invited_by_id: true, status: true },
    });
    if (!invite) throw new NotFoundError('Invitation not found');
    if (invite.invited_by_id !== userId) {
        throw new ForbiddenError('You can only withdraw invitations you sent');
    }
    if (invite.status !== 'pending') {
        throw new BadRequestError('This invitation has already been answered');
    }

    await prisma.olympiad_invites.delete({ where: { id: inviteId } });
    return { id: inviteId };
};

// -----------------------------------------
// Responding to invites
// -----------------------------------------

/**
 * Enters a student into every round of the olympiad that still takes
 * registrations, the same way an educator registering them by hand would.
 */
const enrolStudent = async (tx, { invite, entrantId }) => {
    const rounds = await tx.rounds.findMany({
        where: { olympiad_id: invite.olympiad_id },
        orderBy: { opens_at: 'asc' },
    });

    const educator = await tx.educators.findUnique({
        where: { user_id: invite.invited_by_id },
        select: { id: true },
    });
    if (!educator) {
        throw new BadRequestError(
            'The educator who invited you is no longer at the school'
        );
    }

    for (const round of rounds) {
        if (!REGISTRABLE_STATES.has(round.state)) continue;

        await tx.entrant_registrations.upsert({
            where: {
                entrant_id_round_id: {
                    entrant_id: entrantId,
                    round_id: round.id,
                },
            },
            update: { status: 'registered' },
            create: {
                entrant_id: entrantId,
                round_id: round.id,
                registered_by: educator.id,
                status: 'registered',
            },
        });
    }
};

const respondToInvite = async ({ inviteId, userId, accept }) => {
    const invite = await prisma.olympiad_invites.findUnique({
        where: { id: inviteId },
    });

    if (!invite) throw new NotFoundError('Invitation not found');
    if (invite.invitee_id !== userId) {
        throw new ForbiddenError('This invitation was not sent to you');
    }
    if (invite.status !== 'pending') {
        throw new BadRequestError('You have already answered this invitation');
    }

    if (!accept) {
        const rejected = await prisma.olympiad_invites.update({
            where: { id: inviteId },
            data: { status: 'rejected', responded_at: new Date() },
            select: INVITE_VIEW,
        });
        return toInvite(rejected);
    }

    const accepted = await prisma.$transaction(async (tx) => {
        if (invite.role === 'educator') {
            // Accepting brings the educator's whole school into the olympiad, which
            // is what makes it appear on their dashboard.
            await tx.school_registrations.upsert({
                where: {
                    school_id_olympiad_id: {
                        school_id: invite.school_id,
                        olympiad_id: invite.olympiad_id,
                    },
                },
                update: { status: 'approved' },
                create: {
                    school_id: invite.school_id,
                    olympiad_id: invite.olympiad_id,
                    status: 'approved',
                },
            });
        } else {
            const entrant = await tx.entrants.findUnique({
                where: { user_id: userId },
                select: { id: true },
            });
            if (!entrant)
                throw new BadRequestError(
                    'No entrant record found for your account'
                );
            await enrolStudent(tx, { invite, entrantId: entrant.id });
        }

        return tx.olympiad_invites.update({
            where: { id: inviteId },
            data: { status: 'accepted', responded_at: new Date() },
            select: INVITE_VIEW,
        });
    });

    return toInvite(accepted);
};

module.exports = {
    listMyInvites,
    listOlympiadInvites,
    listSchoolStudentInvites,
    listInviteCandidates,
    createInvite,
    cancelInvite,
    respondToInvite,
};
