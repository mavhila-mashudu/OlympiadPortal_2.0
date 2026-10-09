jest.mock('../../../src/config/database', () => ({
    __esModule: true,
    default: require('../helpers/prismaMock').prisma,
}));

const { prisma, resetPrismaMock } = require('../helpers/prismaMock');
const {
    createOlympiad,
    listOlympiads,
    getOlympiad,
    assertOwnsOlympiad,
    updateOlympiad,
} = require('../../../src/services/olympiadService');

beforeEach(() => {
    resetPrismaMock();
    prisma.olympiads.create.mockResolvedValue({ id: 'oly-1' });
});

describe('updateOlympiad', () => {
    it('updates the name and timezone of an owned olympiad', async () => {
        prisma.olympiads.findUnique.mockResolvedValue({
            id: 'oly-1',
            organiser_id: 'org-1',
        });
        prisma.olympiads.update.mockResolvedValue({
            id: 'oly-1',
            name: 'Maths',
            timezone: 'Africa/Johannesburg',
        });
        await updateOlympiad('oly-1', 'org-1', {
            name: 'Maths',
            timezone: 'Africa/Johannesburg',
        });
        expect(prisma.olympiads.update).toHaveBeenCalledWith({
            where: { id: 'oly-1' },
            data: { name: 'Maths', timezone: 'Africa/Johannesburg' },
        });
    });

    it('rejects an invalid timezone', async () => {
        prisma.olympiads.findUnique.mockResolvedValue({
            id: 'oly-1',
            organiser_id: 'org-1',
        });
        await expect(
            updateOlympiad('oly-1', 'org-1', { timezone: 'Moon/Base' })
        ).rejects.toMatchObject({
            statusCode: 400,
            message: 'Invalid timezone',
        });
        expect(prisma.olympiads.update).not.toHaveBeenCalled();
    });
});

describe('createOlympiad', () => {
    it('creates an olympiad owned by the organiser', async () => {
        prisma.olympiads.create.mockResolvedValue({ id: 'oly-1' });
        await expect(
            createOlympiad({ name: 'Maths', organiserId: 'org-1' })
        ).resolves.toEqual({ id: 'oly-1' });
        expect(prisma.olympiads.create).toHaveBeenCalledWith({
            data: { name: 'Maths', organiser_id: 'org-1' },
        });
        expect(prisma.notification_rules.createMany).toHaveBeenCalledWith({
            data: expect.arrayContaining([
                expect.objectContaining({
                    olympiad_id: 'oly-1',
                    channel: 'in_app',
                }),
            ]),
        });
    });

    it('includes a timezone only when one is given', async () => {
        await createOlympiad({
            name: 'Maths',
            timezone: 'Africa/Johannesburg',
            organiserId: 'org-1',
        });
        expect(prisma.olympiads.create).toHaveBeenCalledWith({
            data: {
                name: 'Maths',
                organiser_id: 'org-1',
                timezone: 'Africa/Johannesburg',
            },
        });
    });
});

describe('listOlympiads', () => {
    it("lists the organiser's olympiads, newest first, with counts", async () => {
        prisma.olympiads.findMany.mockResolvedValue([{ id: 'oly-1' }]);
        await expect(listOlympiads('org-1')).resolves.toEqual([
            { id: 'oly-1' },
        ]);
        expect(prisma.olympiads.findMany).toHaveBeenCalledWith({
            where: { organiser_id: 'org-1' },
            orderBy: { created_at: 'desc' },
            include: {
                _count: {
                    select: { rounds: true, school_registrations: true },
                },
            },
        });
    });
});

describe.each([
    ['getOlympiad', getOlympiad],
    ['assertOwnsOlympiad', assertOwnsOlympiad],
])('%s', (_name, fn) => {
    it('rejects an unknown olympiad', async () => {
        prisma.olympiads.findUnique.mockResolvedValue(null);
        await expect(fn('x', 'org-1')).rejects.toMatchObject({
            statusCode: 404,
            message: 'Olympiad not found',
        });
    });

    it("rejects an organiser who doesn't own it", async () => {
        prisma.olympiads.findUnique.mockResolvedValue({
            id: 'oly-1',
            organiser_id: 'org-1',
        });
        await expect(fn('oly-1', 'org-2')).rejects.toMatchObject({
            statusCode: 403,
            message: 'Not your olympiad',
        });
    });

    it('returns the olympiad to its owner', async () => {
        const olympiad = { id: 'oly-1', organiser_id: 'org-1' };
        prisma.olympiads.findUnique.mockResolvedValue(olympiad);
        await expect(fn('oly-1', 'org-1')).resolves.toBe(olympiad);
    });
});

it('getOlympiad loads the rounds in opening order', async () => {
    prisma.olympiads.findUnique.mockResolvedValue({ organiser_id: 'org-1' });
    await getOlympiad('oly-1', 'org-1');
    expect(prisma.olympiads.findUnique).toHaveBeenCalledWith({
        where: { id: 'oly-1' },
        include: {
            rounds: { orderBy: { opens_at: 'asc' } },
            _count: { select: { school_registrations: true } },
        },
    });
});
