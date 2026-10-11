// Account lifecycle notices use the existing in-app inbox; no new schema or mailer.
// Recipients are resolved from trusted DB memberships, never from signup inputs.
const notify = async (tx, userIds, eventKey, title, body) => {
    const ids = [...new Set(userIds.filter(Boolean))];
    if (!ids.length) return;
    await tx.portal_notifications.createMany({
        data: ids.map((userId) => ({
            user_id: userId,
            dedupe_key: `account:${eventKey}:${userId}`,
            title,
            body,
        })),
        skipDuplicates: true,
    });
};

// A coordinator reviews requests at their school. The organiser reviews
// first-educator applications only when the school has no active coordinator.
async function notifyPendingSignup(tx, { userId, name, schoolId, type }) {
    const coordinatorRows = await tx.school_memberships.findMany({
        where: { school_id: schoolId, role: 'coordinator', status: 'active', users: { deleted_at: null } },
        select: { user_id: true },
    });
    const coordinators = (coordinatorRows || []).map((row) => row.user_id).filter((id) => id !== userId);
    let recipientIds = coordinators;
    if (!recipientIds.length && type === 'educator') {
        const organisers = await tx.users.findMany({
            where: { role: 'organiser', deleted_at: null },
            select: { id: true },
        });
        recipientIds = (organisers || []).map((row) => row.id);
    }
    // If a student has no active school coordinator, no current role can
    // approve that student. Do not mislead the organiser with an unusable alert.
    await notify(
        tx, recipientIds, `signup:${userId}:pending`,
        'New school approval request',
        `${name} has signed up as ${type === 'student' ? 'a student' : 'an educator'} and is awaiting your approval.`,
    );
}

async function notifyInvitationAccepted(tx, { invitationId, invitedById, userId, name, type }) {
    if (!invitedById || invitedById === userId) return;
    await notify(
        tx, [invitedById], `invite:${invitationId}:accepted`,
        'School invitation accepted',
        `${name} joined as ${type === 'student' ? 'a student' : 'an educator'} using your invitation.`,
    );
}

async function notifyDecision(tx, { requestId, userId, decision, type }) {
    await notify(
        tx, [userId], `approval:${type}:${requestId}:${decision}`,
        decision === 'approve' ? 'School membership approved' : 'School membership not approved',
        decision === 'approve'
            ? `Your ${type} registration has been approved. You can now access the portal.`
            : `Your ${type} registration was not approved. Contact your school coordinator or organiser for help.`,
    );
}

module.exports = { notifyPendingSignup, notifyInvitationAccepted, notifyDecision };
