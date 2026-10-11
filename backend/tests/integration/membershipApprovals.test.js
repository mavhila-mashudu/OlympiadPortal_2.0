// Registration approval uses the real database and mock Supabase Auth.
jest.mock('../../src/config/supabase', () => require('./helpers/externalMocks').supabase);

const prisma = require('../../src/config/database').default;
const { register } = require('../../src/services/authService');
const { listRequests, decideRequest } = require('../../src/services/membershipApprovalService');
const { requireAuth } = require('../../src/middlewares/auth');
const { resetExternalMocks, signInAs } = require('./helpers/externalMocks');
const { createOrganiser, createSchool } = require('./helpers/factories');

beforeEach(resetExternalMocks);

const signUp = (email, school_id, school_name) => register({
    full_name: 'Test Educator', email, password: 'Secret123', role: 'educator',
    ...(school_id ? { school_id } : { school_name }),
});

async function checkGuard(user, path) {
    signInAs(user);
    const next = jest.fn();
    await requireAuth({
        headers: { authorization: 'Bearer test' },
        originalUrl: path,
        method: 'GET',
    }, {}, next);
    return next.mock.calls[0]?.[0] || null;
}

test('first school applicant must be approved by organiser before any educator data access', async () => {
    const organiser = await createOrganiser();
    const { user } = await signUp('first@school.test', null, 'Example High School');
    const membership = await prisma.school_memberships.findFirst({ where: { user_id: user.id } });
    expect(membership).toMatchObject({ role: 'coordinator', status: 'pending' });
    expect((await checkGuard(user, '/me/overview'))?.statusCode).toBe(403);
    expect(await checkGuard(user, '/me')).toBeNull();
    const queue = await listRequests({ role: 'organiser', userId: organiser.id });
    expect(queue.map((m) => m.id)).toContain(membership.id);
    await decideRequest({ role: 'organiser', userId: organiser.id }, membership.id, 'approve');
    expect(await checkGuard(user, '/me/overview')).toBeNull();
});

test('active school coordinator approves members of own school, not another school', async () => {
    const organiser = await createOrganiser();
    const { user: first } = await signUp('first@one.test', null, 'School One');
    const firstMember = await prisma.school_memberships.findFirst({ where: { user_id: first.id } });
    await decideRequest({ role: 'organiser', userId: organiser.id }, firstMember.id, 'approve');
    const schoolId = firstMember.school_id;
    const { user: second } = await signUp('second@one.test', schoolId);
    const pending = await prisma.school_memberships.findFirst({ where: { user_id: second.id } });
    expect(pending).toMatchObject({ role: 'educator', status: 'pending' });
    const ownQueue = await listRequests({ role: 'educator', userId: first.id, schoolId });
    expect(ownQueue.map((m) => m.id)).toContain(pending.id);
    const otherSchool = await createSchool({ name: 'Another School' });
    await expect(decideRequest({ role: 'educator', userId: first.id, schoolId: otherSchool.id }, pending.id, 'approve'))
        .rejects.toMatchObject({ statusCode: 403 });
    await expect(decideRequest({ role: 'organiser', userId: organiser.id }, pending.id, 'approve'))
        .rejects.toMatchObject({ statusCode: 403 });
    await decideRequest({ role: 'educator', userId: first.id, schoolId }, pending.id, 'approve');
    expect(await prisma.school_memberships.findUnique({ where: { id: pending.id } }))
        .toMatchObject({ role: 'educator', status: 'active' });
});

test('rejecting membership keeps educator access blocked', async () => {
    const organiser = await createOrganiser();
    const { user } = await signUp('rejected@school.test', null, 'New School');
    const member = await prisma.school_memberships.findFirst({ where: { user_id: user.id } });
    await decideRequest({ role: 'organiser', userId: organiser.id }, member.id, 'reject');
    expect(await prisma.school_memberships.findUnique({ where: { id: member.id } }))
        .toMatchObject({ status: 'rejected' });
    expect((await checkGuard(user, '/me/overview'))?.statusCode).toBe(403);
    expect(await checkGuard(user, '/me')).toBeNull();
});
