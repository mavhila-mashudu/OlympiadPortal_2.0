// @ts-nocheck
// School signup codes: organisers invite educators, while any approved school
// educator may invite educators or students of their own school. Without a code,
// existing manual approval remains required.
const crypto = require('crypto');
const prisma = require('../config/database').default;
const { frontend } = require('../config/env');
const { sendSchoolEducatorInviteEmail } = require('../lib/mailer');
const {
    BadRequestError,
    ConflictError,
    ForbiddenError,
    NotFoundError,
} = require('../errors/AppError');

const VALID_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

// No I, L, O, 0 or 1, so a code read out of an email is hard to mistype
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 12;

// One message for every reason a code fails, so it can't be used to learn
// whether a code exists, was used, or was meant for someone else.
const INVALID_CODE_MESSAGE =
    'This invitation code is not valid. It may have expired, already been used, or been sent to a different email address.';

const normaliseEmail = (email) => String(email || '').trim().toLowerCase();

/** The code as typed or pasted: case, spaces and dashes don't matter. */
const normaliseCode = (code) =>
    String(code || '')
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '');

/** Only this hash is stored; the code itself can't be read back. */
const hashCode = (code) =>
    crypto.createHash('sha256').update(normaliseCode(code)).digest('hex');

/** A random code such as K7QD-2MXP-9TBW (about 59 bits). */
const generateCode = () => {
    let code = '';
    for (let i = 0; i < CODE_LENGTH; i += 1) {
        code += ALPHABET[crypto.randomInt(ALPHABET.length)];
        if (i % 4 === 3 && i < CODE_LENGTH - 1) code += '-';
    }
    return code;
};

const statusOf = (row, now = new Date()) => {
    if (row.used_at) return 'used';
    if (row.revoked_at) return 'revoked';
    if (row.expires_at <= now) return 'expired';
    return 'pending';
};

const toView = (row) => ({
    id: row.id,
    email: row.email,
    role: row.role,
    accountType: row.account_type,
    status: statusOf(row),
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    school: row.schools ? { id: row.schools.id, name: row.schools.name } : null,
    invitedBy: row.invited_by ? { name: row.invited_by.full_name } : null,
});

const VIEW_SELECT = {
    id: true,
    email: true,
    role: true,
    account_type: true,
    created_at: true,
    expires_at: true,
    used_at: true,
    revoked_at: true,
    schools: { select: { id: true, name: true } },
    invited_by: { select: { full_name: true } },
};

// Organisers may invite educators to any school. An educator (coordinator or
// ordinary member) may invite educators and students only to their ACTIVE school.
const assertMayManageSchool = async (user, schoolId) => {
    if (user.role === 'organiser') return;
    if (user.role === 'educator' && user.schoolId === schoolId) {
        const membership = await prisma.school_memberships.findUnique({
            where: {
                user_id_school_id: { user_id: user.userId, school_id: schoolId },
            },
        });
        if (['coordinator', 'educator'].includes(membership?.role) && membership.status === 'active') {
            return;
        }
    }
    throw new ForbiddenError(
        'Only organisers and approved educators may send school invitations'
    );
};

const signupUrlFor = (code) =>
    `${frontend.url.replace(/\/+$/, '')}/signup?code=${encodeURIComponent(code)}`;

/**
 * Invites an educator. A newer invitation to the same address for the same
 * school replaces any earlier one that is still open.
 *
 * The code is only known here, at creation. When the email can't be delivered
 * (the mailer isn't set up, or it failed), the code and link are returned so the
 * inviter can pass them on themselves.
 */
const createInvitation = async (user, { email, schoolId, accountType = 'educator' }) => {
    if (!['educator', 'student'].includes(accountType)) {
        throw new BadRequestError('Choose educator or student');
    }
    if (user.role === 'organiser' && accountType !== 'educator') {
        throw new ForbiddenError('Organisers may issue educator signup invitations only');
    }
    const address = normaliseEmail(email);
    if (!address) throw new BadRequestError('An email address is required');

    // An organiser names the school; a coordinator can only invite to their own
    const targetSchoolId =
        user.role === 'educator' ? user.schoolId : schoolId;
    if (!targetSchoolId) throw new BadRequestError('Choose a school');
    if (user.role === 'educator' && schoolId && schoolId !== targetSchoolId) {
        throw new ForbiddenError('You can only invite people to your own school');
    }
    await assertMayManageSchool(user, targetSchoolId);

    const school = await prisma.schools.findUnique({
        where: { id: targetSchoolId },
        select: { id: true, name: true },
    });
    if (!school) throw new NotFoundError('School not found');

    // A code is only for creating a new account
    const existingUser = await prisma.users.findUnique({
        where: { email: address },
        select: { id: true },
    });
    if (existingUser) {
        throw new ConflictError(
            'Someone with this email address already has an account'
        );
    }

    // Inviting the first educator of a school with no coordinator makes them
    // its coordinator: the organiser is vouching for them, so there is nothing
    // left to approve. Everyone else joins as an educator.
    const hasCoordinator = accountType === 'educator'
        ? await prisma.school_memberships.findFirst({
            where: { school_id: school.id, role: 'coordinator', status: 'active' },
            select: { id: true },
        })
        : null;
    const role = accountType === 'student' ? null
        : user.role === 'organiser' && !hasCoordinator ? 'coordinator' : 'educator';

    const code = generateCode();
    const now = new Date();
    const row = await prisma.$transaction(async (tx) => {
        await tx.school_invitations.updateMany({
            where: {
                school_id: school.id,
                email: address,
                used_at: null,
                revoked_at: null,
            },
            data: { revoked_at: now },
        });
        return tx.school_invitations.create({
            data: {
                school_id: school.id,
                email: address,
                code_hash: hashCode(code),
                role,
                account_type: accountType,
                invited_by_id: user.userId,
                expires_at: new Date(now.getTime() + VALID_DAYS * DAY_MS),
            },
            select: VIEW_SELECT,
        });
    });

    const inviter = await prisma.users.findUnique({
        where: { id: user.userId },
        select: { full_name: true },
    });
    const signupUrl = signupUrlFor(code);
    const { delivered } = await sendSchoolEducatorInviteEmail({
        to: address,
        schoolName: school.name,
        inviterName: inviter?.full_name || 'An organiser',
        code,
        signupUrl,
        asCoordinator: role === 'coordinator',
        accountType,
        validDays: VALID_DAYS,
    });

    return {
        invitation: toView(row),
        emailSent: delivered,
        ...(delivered ? {} : { code, signupUrl }),
    };
};

/** Invitations for any school (organiser), or an active educator's own school. */
const listInvitations = async (user, { schoolId } = {}) => {
    let where = {};
    if (user.role === 'organiser') {
        if (schoolId) where = { school_id: schoolId };
    } else {
        await assertMayManageSchool(user, user.schoolId);
        where = { school_id: user.schoolId };
    }
    const rows = await prisma.school_invitations.findMany({
        where,
        select: VIEW_SELECT,
        orderBy: { created_at: 'desc' },
        take: 200,
    });
    return rows.map(toView);
};

/** Cancels an invitation that hasn't been used. Revoking twice is harmless. */
const revokeInvitation = async (user, invitationId) => {
    const row = await prisma.school_invitations.findUnique({
        where: { id: invitationId },
        select: { id: true, school_id: true, used_at: true, revoked_at: true },
    });
    if (!row) throw new NotFoundError('Invitation not found');
    await assertMayManageSchool(user, row.school_id);
    if (row.used_at) throw new ConflictError('This invitation has already been used');
    if (!row.revoked_at) {
        await prisma.school_invitations.update({
            where: { id: row.id },
            data: { revoked_at: new Date() },
        });
    }
};

/**
 * The invitation a code unlocks, or an error. The email must match the one the
 * invitation was sent to when it is given (signup always gives it).
 */
const findUsableInvitation = async (rawCode, email, expectedAccountType) => {
    const code = normaliseCode(rawCode);
    if (code.length !== CODE_LENGTH) throw new BadRequestError(INVALID_CODE_MESSAGE);

    const invitation = await prisma.school_invitations.findUnique({
        where: { code_hash: hashCode(code) },
        select: {
            id: true,
            school_id: true,
            email: true,
            role: true,
            account_type: true,
            invited_by_id: true,
            used_at: true,
            revoked_at: true,
            expires_at: true,
            schools: { select: { id: true, name: true } },
        },
    });
    if (
        !invitation ||
        statusOf(invitation) !== 'pending' ||
        (expectedAccountType && invitation.account_type !== expectedAccountType) ||
        (email !== undefined && invitation.email !== normaliseEmail(email))
    ) {
        throw new BadRequestError(INVALID_CODE_MESSAGE);
    }
    return invitation;
};

/** What the signup page shows once a code is entered: where it leads and for whom. */
const checkCode = async (rawCode) => {
    const invitation = await findUsableInvitation(rawCode);
    return {
        school: invitation.schools,
        email: invitation.email,
        role: invitation.role,
        accountType: invitation.account_type,
    };
};

/**
 * Marks the invitation used, inside the signup transaction. The conditions are
 * part of the update, so of two signups racing on one code only one succeeds.
 */
const consumeInvitation = async (tx, invitationId, userId) => {
    const now = new Date();
    const { count } = await tx.school_invitations.updateMany({
        where: {
            id: invitationId,
            used_at: null,
            revoked_at: null,
            expires_at: { gt: now },
        },
        data: { used_at: now, used_by_id: userId },
    });
    if (count !== 1) throw new BadRequestError(INVALID_CODE_MESSAGE);
};

module.exports = {
    VALID_DAYS,
    INVALID_CODE_MESSAGE,
    generateCode,
    normaliseCode,
    hashCode,
    createInvitation,
    listInvitations,
    revokeInvitation,
    findUsableInvitation,
    checkCode,
    consumeInvitation,
};
