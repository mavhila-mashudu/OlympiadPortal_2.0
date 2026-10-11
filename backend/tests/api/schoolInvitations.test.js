// /school-invitations: the signup codes a school hands out. Organisers and
// active educators issue them, and the signup form checks one at
// /school-invitations/check before any account exists — the only public route
// here. Codes are stored only as hashes, so the rows below are written with
// the service's own helpers instead of going through the sending routine.
const prisma = require('../../src/config/database').default;
const schoolInvitations = require('../../src/services/schoolInvitationService');
const f = require('../integration/helpers/factories');
const { api, as, expectError, expectOk } = require('./helpers/api');

const DAY = 24 * 60 * 60 * 1000;

// Writes a usable invitation row and hands back the code matching its hash
const createCode = async (
    { school, invitedBy, email = 'invitee@example.com', ...overrides } = {}
) => {
    const code = schoolInvitations.generateCode();
    const invitation = await prisma.school_invitations.create({
        data: {
            school_id: school.id,
            email,
            code_hash: schoolInvitations.hashCode(code),
            role: 'coordinator',
            account_type: 'educator',
            invited_by_id: invitedBy.id,
            expires_at: new Date(Date.now() + 7 * DAY),
            ...overrides,
        },
    });
    return { code, invitation };
};

describe('POST /school-invitations/check', () => {
    it('tells the signup form what a code leads to, without a token', async () => {
        const organiser = await f.createOrganiser();
        const school = await f.createSchool();
        const { code } = await createCode({ school, invitedBy: organiser });

        const { invitation } = expectOk(
            await api().post('/school-invitations/check').send({ code })
        );

        expect(invitation).toEqual({
            school: { id: school.id, name: school.name },
            email: 'invitee@example.com',
            role: 'coordinator',
            accountType: 'educator',
        });
    });

    it('accepts the code however it was typed', async () => {
        const organiser = await f.createOrganiser();
        const school = await f.createSchool();
        const { code } = await createCode({
            school,
            invitedBy: organiser,
            email: 'typed@example.com',
        });

        const { invitation } = expectOk(
            await api()
                .post('/school-invitations/check')
                .send({ code: code.toLowerCase().replace(/-/g, ' ') })
        );

        expect(invitation.email).toBe('typed@example.com');
    });

    it('answers the shared message for an unknown code', async () => {
        expectError(
            await api()
                .post('/school-invitations/check')
                .send({ code: 'AAAA-BBBB-CCCC' }),
            400,
            schoolInvitations.INVALID_CODE_MESSAGE
        );
    });

    it('answers the same message for a revoked code', async () => {
        const organiser = await f.createOrganiser();
        const school = await f.createSchool();
        const { code, invitation } = await createCode({
            school,
            invitedBy: organiser,
        });

        expectOk(
            await as(organiser).delete(`/school-invitations/${invitation.id}`)
        );

        expectError(
            await api().post('/school-invitations/check').send({ code }),
            400,
            schoolInvitations.INVALID_CODE_MESSAGE
        );
    });

    it('validates the body', async () => {
        expectError(
            await api().post('/school-invitations/check').send({}),
            422,
            /Invalid value/
        );
    });

    it('no longer answers on the old /auth/invitations/check path', async () => {
        expectError(
            await api()
                .post('/auth/invitations/check')
                .send({ code: 'AAAA-BBBB-CCCC' }),
            404,
            'Route not found'
        );
    });
});
