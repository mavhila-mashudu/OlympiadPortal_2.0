// @ts-nocheck
const prisma = require('../config/database').default;
const { forgetCachedUser } = require('../middlewares/auth');
const {
    BadRequestError,
    ConflictError,
    ForbiddenError,
    NotFoundError,
} = require('../errors/AppError');

const membershipSelect = {
    id: true,
    school_id: true,
    user_id: true,
    status: true,
    role: true,
    created_at: true,
    users: { select: { full_name: true, email: true } },
    schools: { select: { name: true } },
};

async function listRequests(user) {
    if (user.role === 'organiser') {
        // The organiser handles schools with no active coordinator.
        const pending = await prisma.school_memberships.findMany({
            where: { status: 'pending' },
            select: membershipSelect,
            orderBy: { created_at: 'asc' },
        });
        const active = await prisma.school_memberships.findMany({
            where: { role: 'coordinator', status: 'active' },
            select: { school_id: true },
        });
        const activeSchoolIds = new Set(active.map((m) => m.school_id));
        return pending.filter((m) => !activeSchoolIds.has(m.school_id));
    }
    if (user.role !== 'educator' || !user.schoolId) {
        throw new ForbiddenError('Only school coordinators may review educators');
    }
    const self = await prisma.school_memberships.findUnique({
        where: {
            user_id_school_id: {
                user_id: user.userId,
                school_id: user.schoolId,
            },
        },
    });
    if (!self || self.role !== 'coordinator' || self.status !== 'active') {
        throw new ForbiddenError('Only active coordinators may review educators');
    }
    const educators = await prisma.school_memberships.findMany({
        where: {
            school_id: user.schoolId,
            status: 'pending',
            user_id: { not: user.userId },
        },
        select: membershipSelect,
        orderBy: { created_at: 'asc' },
    });

    // Students who signed up for this school and wait for the coordinator.
    // `candidates` are entrants an educator already listed under the same name
    // (no login yet). Two students can share a name, so the coordinator picks
    // which listed record, if any, is this person; the grade and reference
    // number help tell them apart.
    const students = await prisma.entrants.findMany({
        where: {
            school_id: user.schoolId,
            status: 'pending',
            user_id: { not: null },
        },
        select: {
            id: true,
            school_id: true,
            user_id: true,
            status: true,
            full_name: true,
            created_at: true,
            users: { select: { full_name: true, email: true } },
            schools: { select: { name: true } },
        },
        orderBy: { created_at: 'asc' },
    });
    const listed = students.length
        ? await prisma.entrants.findMany({
              where: {
                  school_id: user.schoolId,
                  user_id: null,
                  status: 'active',
              },
              select: {
                  id: true,
                  full_name: true,
                  grade: true,
                  external_ref: true,
              },
              orderBy: { created_at: 'asc' },
          })
        : [];

    return [
        ...educators.map((m) => ({ ...m, kind: 'educator' })),
        ...students.map(({ full_name, ...s }) => ({
            ...s,
            kind: 'student',
            role: 'student',
            candidates: listed.filter(
                (e) => e.full_name.toLowerCase() === full_name.toLowerCase()
            ),
        })),
    ].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
}

async function decideRequest(user, requestId, decision) {
    if (!['approve', 'reject'].includes(decision)) {
        throw new BadRequestError('Decision must be approve or reject');
    }
    const changed = await prisma.$transaction(async (tx) => {
        const target = await tx.school_memberships.findUnique({
            where: { id: requestId },
            select: { id: true, user_id: true, school_id: true, role: true, status: true },
        });
        if (!target) throw new NotFoundError('Membership request not found');
        if (target.status !== 'pending') {
            throw new ConflictError('Request has already been decided');
        }
        const coordinator = await tx.school_memberships.findFirst({
            where: {
                school_id: target.school_id,
                role: 'coordinator',
                status: 'active',
            },
            select: { user_id: true },
        });
        if (user.role === 'organiser') {
            // Once a school has a coordinator, only that person verifies its staff.
            if (coordinator) {
                throw new ForbiddenError('This school already has a coordinator');
            }
        } else if (user.role === 'educator') {
            if (
                !coordinator ||
                coordinator.user_id !== user.userId ||
                target.school_id !== user.schoolId ||
                target.user_id === user.userId
            ) {
                throw new ForbiddenError('You may approve members of your own school only');
            }
        } else {
            throw new ForbiddenError('Not permitted to approve educators');
        }
        // First approval creates a coordinator. Existing coordinators grant
        // ordinary educator memberships, never additional coordinator roles.
        return tx.school_memberships.update({
            where: { id: requestId, status: 'pending' },
            data: {
                status: decision === 'approve' ? 'active' : 'rejected',
                role: coordinator ? 'educator' : 'coordinator',
            },
            select: { id: true, status: true, role: true, user_id: true },
        });
    });
    // Permissions are cached for up to 30 s; revoke the cached identity so an
    // approved educator gains access on their very next authenticated call.
    forgetCachedUser(changed.user_id);
    return changed;
}

// A student signs up as a pending entrant. Only the active coordinator of that
// student's own school may decide it (organisers do not: they verify the first
// coordinator, after which the school manages its own people).
async function decideStudentRequest(user, entrantId, decision, linkEntrantId) {
    if (!['approve', 'reject'].includes(decision)) {
        throw new BadRequestError('Decision must be approve or reject');
    }
    if (user.role !== 'educator') {
        throw new ForbiddenError('Only school coordinators may review students');
    }
    const changed = await prisma.$transaction(async (tx) => {
        const target = await tx.entrants.findUnique({
            where: { id: entrantId },
            select: {
                id: true,
                user_id: true,
                school_id: true,
                full_name: true,
                status: true,
            },
        });
        if (!target || !target.user_id) {
            throw new NotFoundError('Student request not found');
        }
        if (target.status !== 'pending') {
            throw new ConflictError('Request has already been decided');
        }
        // Looked up for the student's school, so this also stops a coordinator
        // of one school from deciding another school's students
        const self = await tx.school_memberships.findUnique({
            where: {
                user_id_school_id: {
                    user_id: user.userId,
                    school_id: target.school_id,
                },
            },
        });
        if (!self || self.role !== 'coordinator' || self.status !== 'active') {
            throw new ForbiddenError(
                'Only the coordinator of the student’s school may approve students'
            );
        }

        const select = { id: true, status: true, user_id: true };
        if (decision === 'reject') {
            return tx.entrants.update({
                where: { id: target.id, status: 'pending' },
                data: { status: 'rejected' },
                select,
            });
        }

        // Two students can share a name, so nothing is linked by name alone.
        // If the coordinator says this person is one an educator already listed
        // (an entrant with no login yet), the login is attached to that record
        // so its registrations and results carry over. Otherwise the student is
        // approved as a new, separate entrant. The pending row has no
        // registrations or results of its own.
        if (linkEntrantId) {
            const listed = await tx.entrants.findFirst({
                where: {
                    id: linkEntrantId,
                    school_id: target.school_id,
                    user_id: null,
                    status: 'active',
                },
                select: { id: true },
            });
            if (!listed) {
                throw new ConflictError(
                    'That listed student is no longer available to link. Refresh and try again.'
                );
            }
            await tx.entrants.delete({ where: { id: target.id } });
            return tx.entrants.update({
                where: { id: listed.id },
                data: { user_id: target.user_id, status: 'active' },
                select,
            });
        }
        return tx.entrants.update({
            where: { id: target.id, status: 'pending' },
            data: { status: 'active' },
            select,
        });
    });
    // Permissions are cached for up to 30 s; drop the cached identity so the
    // approved student gets in on their very next request.
    forgetCachedUser(changed.user_id);
    return changed;
}

// The unified decision endpoint cannot tell the kind from the URL, so the id
// decides: a row in school_memberships is a staff request, a row in entrants
// is a student signup. An id in neither is not found.
async function decideRequestById(user, requestId, decision, linkEntrantId) {
    if (!['approve', 'reject'].includes(decision)) {
        throw new BadRequestError('Decision must be approve or reject');
    }
    const membership = await prisma.school_memberships.findUnique({
        where: { id: requestId },
        select: { id: true },
    });
    if (membership) {
        return { membership: await decideRequest(user, requestId, decision) };
    }
    const student = await prisma.entrants.findUnique({
        where: { id: requestId },
        select: { id: true },
    });
    if (student) {
        return {
            student: await decideStudentRequest(
                user,
                requestId,
                decision,
                linkEntrantId
            ),
        };
    }
    throw new NotFoundError('Request not found');
}

module.exports = {
    listRequests,
    decideRequest,
    decideStudentRequest,
    decideRequestById,
};
