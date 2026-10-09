// Builders that insert realistic rows straight into the test database.
// Each returns the created record(s); pass overrides for anything a test
// cares about and let the rest default.
const crypto = require('node:crypto');
const prisma = require('../../../src/config/database').default;

const HOUR = 60 * 60 * 1000;
const hoursFromNow = (h) => new Date(Date.now() + h * HOUR);

let counter = 0;
const unique = () => {
    counter += 1;
    return counter;
};

const createUser = (role, overrides = {}) => {
    const n = unique();
    return prisma.users.create({
        data: {
            id: crypto.randomUUID(),
            email: `${role}${n}@olympiad.test`,
            full_name: `${role[0].toUpperCase()}${role.slice(1)} ${n}`,
            role,
            ...overrides,
        },
    });
};

const createOrganiser = (overrides) => createUser('organiser', overrides);

const createOlympiad = async ({ organiser, ...overrides } = {}) => {
    const owner = organiser ?? (await createOrganiser());
    return prisma.olympiads.create({
        data: {
            name: `Olympiad ${unique()}`,
            organiser_id: owner.id,
            ...overrides,
        },
    });
};

const createSchool = (overrides = {}) =>
    prisma.schools.create({
        data: { name: `School ${unique()}`, ...overrides },
    });

const registerSchool = (school, olympiad, overrides = {}) =>
    prisma.school_registrations.create({
        data: { school_id: school.id, olympiad_id: olympiad.id, ...overrides },
    });

// An educator user with their educators row and an active school membership
const createEducator = async ({
    school,
    membershipRole = 'coordinator',
    userOverrides,
} = {}) => {
    const home = school ?? (await createSchool());
    const user = await createUser('educator', userOverrides);
    const educator = await prisma.educators.create({
        data: { user_id: user.id, school_id: home.id },
    });
    const membership = await prisma.school_memberships.create({
        data: { user_id: user.id, school_id: home.id, role: membershipRole },
    });
    return { user, educator, membership, school: home };
};

const createRound = ({ olympiad, ...overrides }) =>
    prisma.rounds.create({
        data: {
            olympiad_id: olympiad.id,
            name: `Round ${unique()}`,
            opens_at: hoursFromNow(24),
            closes_at: hoursFromNow(26),
            ...overrides,
        },
    });

const createPaper = async ({ round, questions = [], ...overrides }) => {
    const paper = await prisma.papers.create({
        data: {
            round_id: round.id,
            title: `${round.name} paper`,
            ...overrides,
        },
    });
    const created = [];
    for (const q of questions) {
        created.push(
            await prisma.questions.create({
                data: {
                    paper_id: paper.id,
                    prompt: `Question ${unique()}`,
                    ...q,
                },
            })
        );
    }
    return { paper, questions: created };
};

const createEntrant = ({ school, ...overrides }) =>
    prisma.entrants.create({
        data: {
            school_id: school.id,
            full_name: `Learner ${unique()}`,
            ...overrides,
        },
    });

// A student user linked to an entrant record at the school
const createStudent = async ({ school, entrantOverrides } = {}) => {
    const user = await createUser('student');
    const entrant = await createEntrant({
        school,
        user_id: user.id,
        ...entrantOverrides,
    });
    return { user, entrant };
};

const registerEntrant = ({ entrant, round, educator, ...overrides }) =>
    prisma.entrant_registrations.create({
        data: {
            entrant_id: entrant.id,
            round_id: round.id,
            registered_by: educator.id,
            ...overrides,
        },
    });

const createInvite = ({ olympiad, invitee, invitedBy, school, ...overrides }) =>
    prisma.olympiad_invites.create({
        data: {
            olympiad_id: olympiad.id,
            invitee_id: invitee.id,
            invited_by_id: invitedBy.id,
            school_id: school ? school.id : null,
            role: invitee.role,
            ...overrides,
        },
    });

// Fixture for the common shape: an organiser's olympiad with one registered
// school that has a coordinator educator.
const createOlympiadWithSchool = async () => {
    const organiser = await createOrganiser();
    const olympiad = await createOlympiad({ organiser });
    const school = await createSchool();
    await registerSchool(school, olympiad);
    const { user: educatorUser, educator } = await createEducator({ school });
    return { organiser, olympiad, school, educatorUser, educator };
};

module.exports = {
    HOUR,
    hoursFromNow,
    createUser,
    createOrganiser,
    createOlympiad,
    createSchool,
    registerSchool,
    createEducator,
    createRound,
    createPaper,
    createEntrant,
    createStudent,
    registerEntrant,
    createInvite,
    createOlympiadWithSchool,
};
