jest.mock('../../../src/config/database', () => ({
    __esModule: true,
    default: require('../helpers/prismaMock').prisma,
}));
jest.mock('../../../src/config/supabase', () => {
    const bucket = { upload: jest.fn(), createSignedUrl: jest.fn() };
    return { storage: { from: jest.fn(() => bucket), bucket } };
});
// roundService pulls in markingService; neither is under test here.
jest.mock('../../../src/services/markingService', () => ({
    autoMarkRoundInternal: jest.fn(),
}));

const { prisma, resetPrismaMock } = require('../helpers/prismaMock');
const supabase = require('../../../src/config/supabase');
const {
    uploadRoundPapers,
    getDownloadUrl,
    getRoundViewUrl,
    listArchive,
    listSharedArchive,
} = require('../../../src/services/paperService');

const { bucket } = supabase.storage;

const ownedRound = (overrides = {}) => ({
    id: 'round-1',
    name: 'Round 1',
    state: 'scheduled',
    olympiads: { id: 'oly-1', organiser_id: 'org-1' },
    ...overrides,
});

beforeEach(() => {
    resetPrismaMock();
    supabase.storage.from.mockClear();
    bucket.upload.mockReset().mockResolvedValue({ error: null });
    bucket.createSignedUrl.mockReset().mockResolvedValue({
        data: { signedUrl: 'https://signed.test/file' },
        error: null,
    });
});

const pdf = (name) => ({
    originalname: name,
    buffer: Buffer.from('%PDF-1.4'),
    mimetype: 'application/pdf',
});
const sharedPath = `shared/${require('node:crypto').createHash('sha256').update(Buffer.from('%PDF-1.4')).digest('hex')}`;

describe('uploadRoundPapers', () => {
    it('rejects replacements after the round opens', async () => {
        prisma.rounds.findUnique.mockResolvedValue(
            ownedRound({ state: 'open' })
        );
        await expect(
            uploadRoundPapers({
                roundId: 'round-1',
                organiserId: 'org-1',
                paperFile: pdf('new.pdf'),
            })
        ).rejects.toMatchObject({
            statusCode: 400,
            message: 'Papers can only be changed before the round opens',
        });
        expect(bucket.upload).not.toHaveBeenCalled();
    });
    it('requires at least one file', async () => {
        prisma.rounds.findUnique.mockResolvedValue(ownedRound());
        await expect(
            uploadRoundPapers({ roundId: 'round-1', organiserId: 'org-1' })
        ).rejects.toMatchObject({
            statusCode: 400,
            message: 'At least one of paper or memo file is required',
        });
    });

    it("rejects an organiser who doesn't own the round", async () => {
        prisma.rounds.findUnique.mockResolvedValue(ownedRound());
        await expect(
            uploadRoundPapers({
                roundId: 'round-1',
                organiserId: 'org-2',
                paperFile: pdf('p.pdf'),
            })
        ).rejects.toMatchObject({ statusCode: 403 });
        expect(bucket.upload).not.toHaveBeenCalled();
    });

    it('stores identical PDFs under one shared content path', async () => {
        prisma.rounds.findUnique.mockResolvedValue(ownedRound());
        prisma.papers.findFirst.mockResolvedValue(null);
        prisma.papers.create.mockResolvedValue({ id: 'paper-1' });

        const paperFile = pdf('maths.pdf');
        const memoFile = pdf('memo.pdf');
        await expect(
            uploadRoundPapers({
                roundId: 'round-1',
                organiserId: 'org-1',
                paperFile,
                memoFile,
            })
        ).resolves.toEqual({ id: 'paper-1' });

        expect(supabase.storage.from).toHaveBeenCalledWith('papers');
        expect(bucket.upload).toHaveBeenCalledWith(
            sharedPath,
            paperFile.buffer,
            {
                contentType: 'application/pdf',
                upsert: true,
            }
        );
        expect(bucket.upload).toHaveBeenCalledWith(
            sharedPath,
            memoFile.buffer,
            {
                contentType: 'application/pdf',
                upsert: true,
            }
        );
        expect(prisma.papers.create).toHaveBeenCalledWith({
            data: {
                round_id: 'round-1',
                title: 'Round 1',
                file_url: sharedPath,
                memo_file_url: sharedPath,
            },
        });
    });

    it('updates the existing paper row with just the memo', async () => {
        prisma.rounds.findUnique.mockResolvedValue(ownedRound());
        prisma.papers.findFirst.mockResolvedValue({ id: 'paper-1' });

        await uploadRoundPapers({
            roundId: 'round-1',
            organiserId: 'org-1',
            memoFile: pdf('memo.pdf'),
        });
        expect(bucket.upload).toHaveBeenCalledTimes(1);
        expect(prisma.papers.update).toHaveBeenCalledWith({
            where: { id: 'paper-1' },
            data: { memo_file_url: sharedPath },
        });
        expect(prisma.papers.create).not.toHaveBeenCalled();
    });

    it.each([
        ['paperFile', 'Paper upload failed: bucket full'],
        ['memoFile', 'Memo upload failed: bucket full'],
    ])('reports a storage error for %s', async (field, message) => {
        prisma.rounds.findUnique.mockResolvedValue(ownedRound());
        bucket.upload.mockResolvedValue({ error: { message: 'bucket full' } });

        await expect(
            uploadRoundPapers({
                roundId: 'round-1',
                organiserId: 'org-1',
                [field]: pdf('f.pdf'),
            })
        ).rejects.toMatchObject({ statusCode: 400, message });
        expect(prisma.papers.create).not.toHaveBeenCalled();
    });
});

describe('getDownloadUrl', () => {
    const storedPaper = (overrides = {}) => ({
        id: 'paper-1',
        file_url: 'rounds/round-1/paper.pdf',
        memo_file_url: 'rounds/round-1/memo.pdf',
        rounds: ownedRound(),
        ...overrides,
    });

    it.each([
        ['an unknown paper', null, 'org-1'],
        ["another organiser's paper", storedPaper(), 'org-2'],
    ])('hides %s as not found', async (_label, paper, organiserId) => {
        prisma.papers.findUnique.mockResolvedValue(paper);
        await expect(
            getDownloadUrl('paper-1', organiserId, 'paper')
        ).rejects.toMatchObject({
            statusCode: 404,
            message: 'Paper not found',
        });
    });

    it('signs a 60-second link to the paper', async () => {
        prisma.papers.findUnique.mockResolvedValue(storedPaper());
        await expect(getDownloadUrl('paper-1', 'org-1', 'paper')).resolves.toBe(
            'https://signed.test/file'
        );
        expect(bucket.createSignedUrl).toHaveBeenCalledWith(
            'rounds/round-1/paper.pdf',
            60
        );
    });

    it('signs a link to the memo when asked', async () => {
        prisma.papers.findUnique.mockResolvedValue(storedPaper());
        await getDownloadUrl('paper-1', 'org-1', 'memo');
        expect(bucket.createSignedUrl).toHaveBeenCalledWith(
            'rounds/round-1/memo.pdf',
            60
        );
    });

    it("reports when that file hasn't been uploaded", async () => {
        prisma.papers.findUnique.mockResolvedValue(
            storedPaper({ memo_file_url: null })
        );
        await expect(
            getDownloadUrl('paper-1', 'org-1', 'memo')
        ).rejects.toMatchObject({
            statusCode: 404,
            message: 'No memo uploaded for this round',
        });
    });

    it('reports a signing failure', async () => {
        prisma.papers.findUnique.mockResolvedValue(storedPaper());
        bucket.createSignedUrl.mockResolvedValue({
            data: null,
            error: { message: 'denied' },
        });
        await expect(
            getDownloadUrl('paper-1', 'org-1', 'paper')
        ).rejects.toMatchObject({
            message: 'Could not generate download link: denied',
        });
    });
});

describe('getRoundViewUrl', () => {
    it('keeps the memo organiser-only, before any database lookup', async () => {
        await expect(
            getRoundViewUrl('round-1', 'edu', 'educator', 'memo')
        ).rejects.toMatchObject({
            statusCode: 403,
            message: 'Only the organiser can view the memo',
        });
        expect(prisma.rounds.findUnique).not.toHaveBeenCalled();
    });

    it('checks round access with the real question-service rules', async () => {
        // Regression for the missing assertRoundAccess export: this call used
        // to throw "assertRoundAccess is not a function".
        prisma.rounds.findUnique.mockResolvedValue(ownedRound());
        await expect(
            getRoundViewUrl('round-1', 'org-2', 'organiser', 'paper')
        ).rejects.toMatchObject({
            statusCode: 403,
            message: 'Not your round',
        });
    });

    it('gives an educator at a registered school a 1-hour link to the paper', async () => {
        prisma.rounds.findUnique.mockResolvedValue(ownedRound());
        prisma.educators.findUnique.mockResolvedValue({
            school_id: 'school-1',
        });
        prisma.school_registrations.findFirst.mockResolvedValue({ id: 'reg' });
        prisma.papers.findFirst.mockResolvedValue({
            file_url: 'rounds/round-1/paper.pdf',
        });

        await expect(
            getRoundViewUrl('round-1', 'edu', 'educator', 'paper')
        ).resolves.toBe('https://signed.test/file');
        expect(bucket.createSignedUrl).toHaveBeenCalledWith(
            'rounds/round-1/paper.pdf',
            3600
        );
    });

    it('gives the organiser the memo', async () => {
        prisma.rounds.findUnique.mockResolvedValue(ownedRound());
        prisma.papers.findFirst.mockResolvedValue({
            file_url: 'p.pdf',
            memo_file_url: 'm.pdf',
        });
        await getRoundViewUrl('round-1', 'org-1', 'organiser', 'memo');
        expect(bucket.createSignedUrl).toHaveBeenCalledWith('m.pdf', 3600);
    });

    it('reports a round with no paper', async () => {
        prisma.rounds.findUnique.mockResolvedValue(ownedRound());
        prisma.papers.findFirst.mockResolvedValue(null);
        await expect(
            getRoundViewUrl('round-1', 'org-1', 'organiser', 'paper')
        ).rejects.toMatchObject({
            message: 'No paper uploaded for this round',
        });
    });

    it('reports a paper row with no file', async () => {
        prisma.rounds.findUnique.mockResolvedValue(ownedRound());
        prisma.papers.findFirst.mockResolvedValue({ file_url: null });
        await expect(
            getRoundViewUrl('round-1', 'org-1', 'organiser', 'paper')
        ).rejects.toMatchObject({
            message: 'No paper uploaded for this round',
        });
    });

    it('reports a signing failure', async () => {
        prisma.rounds.findUnique.mockResolvedValue(ownedRound());
        prisma.papers.findFirst.mockResolvedValue({ file_url: 'p.pdf' });
        bucket.createSignedUrl.mockResolvedValue({
            data: null,
            error: { message: 'denied' },
        });
        await expect(
            getRoundViewUrl('round-1', 'org-1', 'organiser', 'paper')
        ).rejects.toMatchObject({
            message: 'Could not generate view link: denied',
        });
    });
});

describe('listArchive', () => {
    it('lists released rounds with archived papers, most recent first', async () => {
        prisma.olympiads.findUnique.mockResolvedValue({
            id: 'oly-1',
            organiser_id: 'org-1',
        });
        prisma.rounds.findMany.mockResolvedValue([{ id: 'round-1' }]);

        await expect(listArchive('oly-1', 'org-1')).resolves.toEqual([
            { id: 'round-1' },
        ]);
        expect(prisma.rounds.findMany).toHaveBeenCalledWith({
            where: {
                olympiad_id: 'oly-1',
                state: 'results_released',
                papers: { some: { is_archived: true } },
            },
            orderBy: { closes_at: 'desc' },
            include: { papers: true },
        });
    });

    it("rejects an organiser who doesn't own the olympiad", async () => {
        prisma.olympiads.findUnique.mockResolvedValue({
            id: 'oly-1',
            organiser_id: 'org-1',
        });
        await expect(listArchive('oly-1', 'org-2')).rejects.toMatchObject({
            statusCode: 403,
        });
    });
});

it("shares archived rounds only across the organiser's olympiads", async () => {
    prisma.rounds.findMany.mockResolvedValue([
        { id: 'round-1' },
        { id: 'round-2' },
    ]);
    await expect(listSharedArchive('org-1')).resolves.toHaveLength(2);
    expect(prisma.rounds.findMany).toHaveBeenCalledWith({
        where: {
            olympiads: { organiser_id: 'org-1' },
            state: 'results_released',
            papers: { some: { is_archived: true } },
        },
        orderBy: { closes_at: 'desc' },
        include: {
            papers: true,
            olympiads: { select: { id: true, name: true, timezone: true } },
        },
    });
});

describe("when file storage isn't configured", () => {
    let unconfigured;
    beforeEach(() => {
        jest.resetModules();
        jest.doMock('../../../src/config/supabase', () => null);
        unconfigured = require('../../../src/services/paperService');
    });

    it.each([
        [
            'uploadRoundPapers',
            () =>
                unconfigured.uploadRoundPapers({
                    roundId: 'r',
                    organiserId: 'o',
                }),
        ],
        [
            'getDownloadUrl',
            () => unconfigured.getDownloadUrl('p', 'o', 'paper'),
        ],
        [
            'getRoundViewUrl',
            () => unconfigured.getRoundViewUrl('r', 'o', 'organiser', 'paper'),
        ],
    ])('%s refuses', async (_name, call) => {
        await expect(call()).rejects.toMatchObject({
            statusCode: 400,
            message: 'File storage is not configured on this server',
        });
    });
});
