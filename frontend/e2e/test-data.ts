// Fixed ids and credentials for the seeded database, so tests can navigate
// straight to a known round and assert on known names.
export const PORTS = {
    backend: 3100,
    frontend: 5174,
    supabase: 54321,
};

export const URLS = {
    api: `http://127.0.0.1:${PORTS.backend}`,
    app: `http://127.0.0.1:${PORTS.frontend}`,
    supabase: `http://127.0.0.1:${PORTS.supabase}`,
};

export const PASSWORD = 'Secret123';

export const USERS = {
    organiser: {
        id: '11111111-1111-4111-8111-111111111111',
        email: 'organiser@e2e.test',
        password: PASSWORD,
        fullName: 'Thandi Mokoena',
    },
    educator: {
        id: '22222222-2222-4222-8222-222222222222',
        email: 'educator@e2e.test',
        password: PASSWORD,
        fullName: 'Sipho Dlamini',
    },
    student: {
        id: '33333333-3333-4333-8333-333333333333',
        email: 'student@e2e.test',
        password: PASSWORD,
        fullName: 'Ayanda Khumalo',
    },
    // Used by the account-deletion test, so no other test loses its account
    disposable: {
        id: '44444444-4444-4444-8444-444444444444',
        email: 'leaving@e2e.test',
        password: PASSWORD,
        fullName: 'Temporary Organiser',
    },
    // Used by the password-reset test for the same reason
    resetting: {
        id: '55555555-5555-4555-8555-555555555555',
        email: 'forgetful@e2e.test',
        password: PASSWORD,
        fullName: 'Forgetful Organiser',
    },
    // A second learner at the same school, so the invite-and-accept test has
    // somebody of its own to invite
    joiningStudent: {
        id: '77777777-7777-4777-8777-777777777777',
        email: 'joining@e2e.test',
        password: PASSWORD,
        fullName: 'Lerato Nkosi',
    },
    // A coordinator at a school that has not joined the olympiad yet, so the
    // organiser has somebody to invite
    otherEducator: {
        id: '66666666-6666-4666-8666-666666666666',
        email: 'northview@e2e.test',
        password: PASSWORD,
        fullName: 'Nomsa Zulu',
    },
};

export const SCHOOL = {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    name: 'Parktown High',
};

export const OLYMPIAD = {
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    name: 'Maths Olympiad 2026',
};

export const EDUCATOR_PROFILE_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
export const ENTRANT_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
export const JOINING_ENTRANT_ID = '60606060-6060-4060-8060-606060606060';

// A live, open round the student can sit online
export const LIVE_ROUND = {
    id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    name: 'Round 1 — Regional',
    paperId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
    mcqId: '10101010-1010-4010-8010-101010101010',
    shortId: '20202020-2020-4020-8020-202020202020',
};

// A scheduled round whose exam is still a draft, for the educator to build
export const DRAFT_ROUND = {
    id: '30303030-3030-4030-8030-303030303030',
    name: 'Round 2 — Provincial',
};

// A school that is not taking part yet, whose coordinator the organiser can
// invite from the schools page
export const UNREGISTERED_SCHOOL = {
    id: '40404040-4040-4040-8040-404040404040',
    name: 'Northview College',
    educatorProfileId: '50505050-5050-4050-8050-505050505050',
};
