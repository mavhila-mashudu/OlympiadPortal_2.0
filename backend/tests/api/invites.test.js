// /invites: the in-app invitation flow that replaced emailed signup codes.
// An organiser invites an educator (accepting registers their school), and an
// educator invites a student of their own school (accepting enters them into
// the olympiad's rounds).
const prisma = require('../../src/config/database').default;
const f = require('../integration/helpers/factories');
const { api, as, expectError, expectOk } = require('./helpers/api');

const invite = (sender, body) => as(sender).post('/invites').send(body);

describe('POST /invites', () => {
    it('lets an organiser invite an educator, and records who it is for', async () => {
        const organiser = await f.createOrganiser();
        const olympiad = await f.createOlympiad({ organiser });
        const { user: educatorUser, school } = await f.createEducator();

        const { invite: created } = expectOk(
            await invite(organiser, {
                olympiad_id: olympiad.id,
                invitee_id: educatorUser.id,
                message: 'We would love your school to take part.',
            }),
            201
        );

        expect(created).toMatchObject({
            role: 'educator',
            status: 'pending',
            message: 'We would love your school to take part.',
            olympiad: { id: olympiad.id, name: olympiad.name },
            school: { id: school.id, name: school.name },
            invitee: { id: educatorUser.id, name: educatorUser.full_name },
        });
        // Nothing is registered until the educator answers
        expect(
            await prisma.school_registrations.count({
                where: { olympiad_id: olympiad.id },
            })
        ).toBe(0);
    });

    it('refuses an olympiad the organiser does not own', async () => {
        const organiser = await f.createOrganiser();
        const olympiad = await f.createOlympiad();
        const { user: educatorUser } = await f.createEducator();

        expectError(
            await invite(organiser, {
                olympiad_id: olympiad.id,
                invitee_id: educatorUser.id,
            }),
            403,
            'You can only invite people to your own olympiads'
        );
    });

    it('refuses an organiser inviting a student directly', async () => {
        const organiser = await f.createOrganiser();
        const olympiad = await f.createOlympiad({ organiser });
        const school = await f.createSchool();
        const { user: studentUser } = await f.createStudent({ school });

        expectError(
            await invite(organiser, {
                olympiad_id: olympiad.id,
                invitee_id: studentUser.id,
            }),
            400,
            'Organisers invite educators; educators invite their students'
        );
    });

    it('lets an educator invite a student of their own school', async () => {
        const { olympiad, school, educatorUser } =
            await f.createOlympiadWithSchool();
        const { user: studentUser } = await f.createStudent({ school });

        const { invite: created } = expectOk(
            await invite(educatorUser, {
                olympiad_id: olympiad.id,
                invitee_id: studentUser.id,
            }),
            201
        );

        expect(created).toMatchObject({
            role: 'student',
            status: 'pending',
            invitee: { id: studentUser.id },
            invitedBy: { id: educatorUser.id },
        });
    });

    it('refuses a student from another school', async () => {
        const { olympiad, educatorUser } = await f.createOlympiadWithSchool();
        const elsewhere = await f.createSchool();
        const { user: studentUser } = await f.createStudent({
            school: elsewhere,
        });

        expectError(
            await invite(educatorUser, {
                olympiad_id: olympiad.id,
                invitee_id: studentUser.id,
            }),
            403,
            'That student is not at your school'
        );
    });

    it("refuses an olympiad the educator's school is not registered for", async () => {
        const { school, user: educatorUser } = await f.createEducator();
        const olympiad = await f.createOlympiad();
        const { user: studentUser } = await f.createStudent({ school });

        expectError(
            await invite(educatorUser, {
                olympiad_id: olympiad.id,
                invitee_id: studentUser.id,
            }),
            403,
            'Your school is not registered for this olympiad'
        );
    });

    it('refuses a second invitation to the same person for the same olympiad', async () => {
        const organiser = await f.createOrganiser();
        const olympiad = await f.createOlympiad({ organiser });
        const { user: educatorUser } = await f.createEducator();

        expectOk(
            await invite(organiser, {
                olympiad_id: olympiad.id,
                invitee_id: educatorUser.id,
            }),
            201
        );
        expectError(
            await invite(organiser, {
                olympiad_id: olympiad.id,
                invitee_id: educatorUser.id,
            }),
            409,
            'That person has already been invited to this olympiad'
        );
    });

    it('validates the request body', async () => {
        const organiser = await f.createOrganiser();
        expectError(
            await invite(organiser, {
                olympiad_id: 'not-a-uuid',
                invitee_id: 'also-not',
            }),
            422,
            'Valid olympiad id required, Select someone to invite'
        );
    });
});

describe('GET /invites/mine', () => {
    it('shows the invitations addressed to the signed-in user', async () => {
        const organiser = await f.createOrganiser();
        const olympiad = await f.createOlympiad({ organiser });
        const { user: educatorUser, school } = await f.createEducator();
        await f.createInvite({
            olympiad,
            invitee: educatorUser,
            invitedBy: organiser,
            school,
        });

        const { invites } = expectOk(
            await as(educatorUser).get('/invites/mine')
        );

        expect(invites).toHaveLength(1);
        expect(invites[0]).toMatchObject({
            status: 'pending',
            olympiad: { id: olympiad.id },
        });
    });

    it('does not leak invitations addressed to someone else', async () => {
        const organiser = await f.createOrganiser();
        const olympiad = await f.createOlympiad({ organiser });
        const { user: educatorUser, school } = await f.createEducator();
        await f.createInvite({
            olympiad,
            invitee: educatorUser,
            invitedBy: organiser,
            school,
        });
        const other = await f.createOrganiser();

        expect(expectOk(await as(other).get('/invites/mine')).invites).toEqual(
            []
        );
    });
});

describe('POST /invites/:inviteId/accept', () => {
    it("registers the educator's school for the olympiad", async () => {
        const organiser = await f.createOrganiser();
        const olympiad = await f.createOlympiad({ organiser });
        const { user: educatorUser, school } = await f.createEducator();
        const pending = await f.createInvite({
            olympiad,
            invitee: educatorUser,
            invitedBy: organiser,
            school,
        });

        const { invite: answered } = expectOk(
            await as(educatorUser).post(`/invites/${pending.id}/accept`)
        );

        expect(answered).toMatchObject({ status: 'accepted' });
        expect(
            await prisma.school_registrations.findUnique({
                where: {
                    school_id_olympiad_id: {
                        school_id: school.id,
                        olympiad_id: olympiad.id,
                    },
                },
            })
        ).toMatchObject({ status: 'approved' });
    });

    it('enters the student into every round that still takes registrations', async () => {
        const { olympiad, school, educatorUser, educator } =
            await f.createOlympiadWithSchool();
        const open = await f.createRound({ olympiad, state: 'open' });
        const closed = await f.createRound({ olympiad, state: 'closed' });
        const { user: studentUser, entrant } = await f.createStudent({
            school,
        });
        const pending = await f.createInvite({
            olympiad,
            invitee: studentUser,
            invitedBy: educatorUser,
            school,
        });

        expectOk(await as(studentUser).post(`/invites/${pending.id}/accept`));

        const registrations = await prisma.entrant_registrations.findMany({
            where: { entrant_id: entrant.id },
        });
        expect(registrations).toHaveLength(1);
        expect(registrations[0]).toMatchObject({
            round_id: open.id,
            registered_by: educator.id,
            status: 'registered',
        });
        expect(registrations.map((r) => r.round_id)).not.toContain(closed.id);
    });

    it('refuses an invitation addressed to someone else', async () => {
        const organiser = await f.createOrganiser();
        const olympiad = await f.createOlympiad({ organiser });
        const { user: educatorUser, school } = await f.createEducator();
        const pending = await f.createInvite({
            olympiad,
            invitee: educatorUser,
            invitedBy: organiser,
            school,
        });
        const intruder = (await f.createEducator()).user;

        expectError(
            await as(intruder).post(`/invites/${pending.id}/accept`),
            403,
            'This invitation was not sent to you'
        );
    });

    it('refuses an invitation that has already been answered', async () => {
        const organiser = await f.createOrganiser();
        const olympiad = await f.createOlympiad({ organiser });
        const { user: educatorUser, school } = await f.createEducator();
        const pending = await f.createInvite({
            olympiad,
            invitee: educatorUser,
            invitedBy: organiser,
            school,
        });

        expectOk(await as(educatorUser).post(`/invites/${pending.id}/accept`));
        expectError(
            await as(educatorUser).post(`/invites/${pending.id}/accept`),
            400,
            'You have already answered this invitation'
        );
    });

    it('404s for an invitation that does not exist', async () => {
        const educatorUser = (await f.createEducator()).user;
        expectError(
            await as(educatorUser).post(
                '/invites/00000000-0000-4000-8000-000000000000/accept'
            ),
            404,
            'Invitation not found'
        );
    });
});

describe('POST /invites/:inviteId/reject', () => {
    it('marks the invitation rejected and registers nothing', async () => {
        const organiser = await f.createOrganiser();
        const olympiad = await f.createOlympiad({ organiser });
        const { user: educatorUser, school } = await f.createEducator();
        const pending = await f.createInvite({
            olympiad,
            invitee: educatorUser,
            invitedBy: organiser,
            school,
        });

        const { invite: answered } = expectOk(
            await as(educatorUser).post(`/invites/${pending.id}/reject`)
        );

        expect(answered).toMatchObject({
            status: 'rejected',
            respondedAt: expect.any(String),
        });
        expect(
            await prisma.school_registrations.count({
                where: { olympiad_id: olympiad.id },
            })
        ).toBe(0);
    });
});

describe('GET /invites/candidates', () => {
    it('offers an organiser the educators who have not been invited yet', async () => {
        const organiser = await f.createOrganiser();
        const olympiad = await f.createOlympiad({ organiser });
        const { user: available, school } = await f.createEducator();
        const { user: alreadyInvited, school: otherSchool } =
            await f.createEducator();
        await f.createInvite({
            olympiad,
            invitee: alreadyInvited,
            invitedBy: organiser,
            school: otherSchool,
        });

        const { candidates } = expectOk(
            await as(organiser).get(
                `/invites/candidates?olympiad_id=${olympiad.id}`
            )
        );

        expect(candidates.map((c) => c.id)).toEqual([available.id]);
        expect(candidates[0].school).toEqual({
            id: school.id,
            name: school.name,
        });
    });

    it('offers an educator only the students of their own school', async () => {
        const { olympiad, school, educatorUser } =
            await f.createOlympiadWithSchool();
        const { user: mine } = await f.createStudent({ school });
        const elsewhere = await f.createSchool();
        await f.createStudent({ school: elsewhere });

        const { candidates } = expectOk(
            await as(educatorUser).get(
                `/invites/candidates?olympiad_id=${olympiad.id}`
            )
        );

        expect(candidates.map((c) => c.id)).toEqual([mine.id]);
    });
});

describe('GET /invites/sent', () => {
    it('shows an organiser the invitations for one of their olympiads', async () => {
        const organiser = await f.createOrganiser();
        const olympiad = await f.createOlympiad({ organiser });
        const { user: educatorUser, school } = await f.createEducator();
        await f.createInvite({
            olympiad,
            invitee: educatorUser,
            invitedBy: organiser,
            school,
        });

        const { invites } = expectOk(
            await as(organiser).get(`/invites/sent?olympiad_id=${olympiad.id}`)
        );

        expect(invites).toHaveLength(1);
        expect(invites[0].invitee).toMatchObject({ id: educatorUser.id });
    });

    it('shows an educator the student invitations for their school', async () => {
        const { olympiad, school, educatorUser } =
            await f.createOlympiadWithSchool();
        const { user: studentUser } = await f.createStudent({ school });
        await f.createInvite({
            olympiad,
            invitee: studentUser,
            invitedBy: educatorUser,
            school,
        });

        const { invites } = expectOk(
            await as(educatorUser).get('/invites/sent')
        );

        expect(invites).toHaveLength(1);
        expect(invites[0]).toMatchObject({
            role: 'student',
            invitee: { id: studentUser.id },
        });
    });
});

describe('DELETE /invites/:inviteId', () => {
    it('withdraws an invitation the sender has not had answered yet', async () => {
        const organiser = await f.createOrganiser();
        const olympiad = await f.createOlympiad({ organiser });
        const { user: educatorUser, school } = await f.createEducator();
        const pending = await f.createInvite({
            olympiad,
            invitee: educatorUser,
            invitedBy: organiser,
            school,
        });

        expectOk(await as(organiser).delete(`/invites/${pending.id}`));

        expect(
            await prisma.olympiad_invites.findUnique({
                where: { id: pending.id },
            })
        ).toBeNull();
    });

    it("refuses to withdraw someone else's invitation", async () => {
        const organiser = await f.createOrganiser();
        const olympiad = await f.createOlympiad({ organiser });
        const { user: educatorUser, school } = await f.createEducator();
        const pending = await f.createInvite({
            olympiad,
            invitee: educatorUser,
            invitedBy: organiser,
            school,
        });
        const other = await f.createOrganiser();

        expectError(
            await as(other).delete(`/invites/${pending.id}`),
            403,
            'You can only withdraw invitations you sent'
        );
    });
});

describe('unauthenticated access', () => {
    it('requires a token', async () => {
        expectError(await api().get('/invites/mine'), 401, 'No token provided');
    });
});
