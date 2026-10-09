// Certificates (I17): a student who qualified in a released round downloads a
// PDF certificate. Nobody else gets one.
const prisma = require('../../src/config/database').default;
const f = require('../integration/helpers/factories');
const { as, expectError } = require('./helpers/api');

const MISSING = '00000000-0000-4000-8000-000000000000';

// A released round with one student who qualified and one who didn't
const setup = async ({ state = 'results_released' } = {}) => {
    const world = await f.createOlympiadWithSchool();
    await prisma.olympiads.update({
        where: { id: world.olympiad.id },
        data: { name: 'Maths Olympiad 2026' },
    });
    await prisma.schools.update({
        where: { id: world.school.id },
        data: { name: 'Soweto High' },
    });
    const round = await f.createRound({
        olympiad: world.olympiad,
        name: 'Provincial final',
        state,
    });

    const withResult = async (
        fullName,
        points,
        qualified,
        finalised = true
    ) => {
        const student = await f.createStudent({
            school: world.school,
            entrantOverrides: { full_name: fullName },
        });
        await prisma.results.create({
            data: {
                round_id: round.id,
                entrant_id: student.entrant.id,
                total_points: points,
                rank: qualified ? 1 : 2,
                qualified,
                finalised_at: finalised
                    ? new Date('2026-09-20T10:00:00Z')
                    : null,
            },
        });
        return { ...student, api: as(student.user) };
    };

    return {
        ...world,
        round,
        winner: await withResult('Ayanda Khumalo', 73.5, true),
        other: await withResult('Lerato Nkosi', 12, false),
    };
};

// supertest leaves unknown content types as a stream; collect the PDF bytes
const binary = (res, done) => {
    const chunks = [];
    res.on('data', (c) => chunks.push(c));
    res.on('end', () => done(null, Buffer.concat(chunks)));
};

describe('GET /rounds/:roundId/certificate', () => {
    it('gives a qualified student a PDF naming them, the round, the olympiad and their score', async () => {
        const { round, winner } = await setup();

        const res = await winner.api
            .get(`/rounds/${round.id}/certificate`)
            .buffer(true)
            .parse(binary);

        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toBe('application/pdf');
        expect(res.headers['content-disposition']).toBe(
            `attachment; filename="certificate-${round.id}.pdf"`
        );
        const pdf = res.body.toString('latin1');
        expect(pdf).toMatch(/^%PDF-1\.4/);
        for (const text of [
            'Ayanda Khumalo',
            'For qualifying in Provincial final',
            'Maths Olympiad 2026',
            'School: Soweto High',
            'Score: 73.5 points',
            'Issued: 2026-09-20',
        ]) {
            expect(pdf).toContain(`(${text}) Tj`);
        }
    });

    it("refuses a student who didn't qualify", async () => {
        const { round, other } = await setup();
        expectError(
            await other.api.get(`/rounds/${round.id}/certificate`),
            403,
            'Certificate not earned for this round'
        );
    });

    it('waits until results are released', async () => {
        const { round, winner } = await setup({ state: 'marking' });
        expectError(
            await winner.api.get(`/rounds/${round.id}/certificate`),
            404,
            'Released round not found'
        );
        expectError(
            await winner.api.get(`/rounds/${MISSING}/certificate`),
            404,
            'Released round not found'
        );
    });

    it('refuses a student with no result in the round', async () => {
        const { round, school } = await setup();
        const bystander = await f.createStudent({ school });
        expectError(
            await as(bystander.user).get(`/rounds/${round.id}/certificate`),
            403,
            'Certificate not earned for this round'
        );
    });

    it('needs a student account linked to a learner', async () => {
        const { round } = await setup();
        const unlinked = await f.createUser('student');
        expectError(
            await as(unlinked).get(`/rounds/${round.id}/certificate`),
            403,
            'Student account required'
        );
    });
});
