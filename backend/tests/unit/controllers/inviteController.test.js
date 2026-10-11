jest.mock('../../../src/services/inviteService', () => ({
    listMyInvites: jest.fn(),
    listOlympiadInvites: jest.fn(),
    listSchoolStudentInvites: jest.fn(),
    listInviteCandidates: jest.fn(),
    createInvite: jest.fn(),
    cancelInvite: jest.fn(),
    respondToInvite: jest.fn(),
}));

const inviteService = require('../../../src/services/inviteService');
const controller = require('../../../src/controllers/inviteController');
const { mockReq, run } = require('../helpers/http');
const { describeControllerCases } = require('../helpers/controllerCases');

const organiser = { userId: 'org-1', role: 'organiser' };
const educator = { userId: 'edu-1', role: 'educator' };
const student = { userId: 'stu-1', role: 'student' };
const ok = (data) => ({ success: true, data });

describeControllerCases(controller, [
    {
        handler: 'listMyInvites',
        service: inviteService,
        method: 'listMyInvites',
        req: mockReq({ user: student }),
        args: ['stu-1'],
        json: (result) => ok({ invites: result }),
    },
    {
        handler: 'listCandidates',
        service: inviteService,
        method: 'listInviteCandidates',
        req: mockReq({ user: organiser, query: { olympiad_id: 'oly-1' } }),
        args: [{ olympiadId: 'oly-1', userId: 'org-1', role: 'organiser' }],
        json: (result) => ok({ candidates: result }),
    },
    {
        handler: 'createInvite',
        service: inviteService,
        method: 'createInvite',
        req: mockReq({
            user: organiser,
            body: {
                olympiad_id: 'oly-1',
                invitee_id: 'edu-1',
                message: 'Please join',
            },
        }),
        args: [
            {
                olympiadId: 'oly-1',
                inviteeId: 'edu-1',
                message: 'Please join',
                inviterId: 'org-1',
                inviterRole: 'organiser',
            },
        ],
        status: 201,
        json: (result) => ok({ invite: result }),
    },
    {
        handler: 'acceptInvite',
        service: inviteService,
        method: 'respondToInvite',
        req: mockReq({ user: educator, params: { invitationId: 'inv-1' } }),
        args: [{ inviteId: 'inv-1', userId: 'edu-1', accept: true }],
        json: (result) => ok({ invite: result }),
    },
    {
        handler: 'rejectInvite',
        service: inviteService,
        method: 'respondToInvite',
        req: mockReq({ user: educator, params: { invitationId: 'inv-1' } }),
        args: [{ inviteId: 'inv-1', userId: 'edu-1', accept: false }],
        json: (result) => ok({ invite: result }),
    },
    {
        handler: 'cancelInvite',
        service: inviteService,
        method: 'cancelInvite',
        req: mockReq({ user: organiser, params: { invitationId: 'inv-1' } }),
        args: [{ inviteId: 'inv-1', userId: 'org-1' }],
        json: (result) => ok(result),
    },
]);

// listSentInvites picks a different service call depending on who is asking,
// so it is covered separately rather than through the shared cases.
describe('listSentInvites', () => {
    beforeEach(() => {
        inviteService.listOlympiadInvites
            .mockReset()
            .mockResolvedValue([{ id: 'inv-1' }]);
        inviteService.listSchoolStudentInvites
            .mockReset()
            .mockResolvedValue([{ id: 'inv-2' }]);
    });

    it("asks for one olympiad's invitations when an organiser calls it", async () => {
        const { res } = await run(
            controller.listSentInvites,
            mockReq({ user: organiser, query: { olympiad_id: 'oly-1' } })
        );

        expect(inviteService.listOlympiadInvites).toHaveBeenCalledWith(
            'oly-1',
            'org-1'
        );
        expect(inviteService.listSchoolStudentInvites).not.toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith(
            ok({ invites: [{ id: 'inv-1' }] })
        );
    });

    it("asks for the school's student invitations when an educator calls it", async () => {
        const { res } = await run(
            controller.listSentInvites,
            mockReq({ user: educator })
        );

        expect(inviteService.listSchoolStudentInvites).toHaveBeenCalledWith(
            'edu-1'
        );
        expect(inviteService.listOlympiadInvites).not.toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith(
            ok({ invites: [{ id: 'inv-2' }] })
        );
    });

    it('passes a service error to the error handler', async () => {
        const err = new Error('service failed');
        inviteService.listSchoolStudentInvites.mockRejectedValue(err);

        const { res, next } = await run(
            controller.listSentInvites,
            mockReq({ user: educator })
        );

        expect(next).toHaveBeenCalledWith(err);
        expect(res.json).not.toHaveBeenCalled();
    });
});
