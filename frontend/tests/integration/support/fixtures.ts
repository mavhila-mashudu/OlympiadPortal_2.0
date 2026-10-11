// Response payloads shaped exactly like the backend's (the `data` part of the
// envelope). Notably, Prisma Decimal columns — max_points, negative_pct,
// total_points, qualifying_threshold, points_awarded — arrive as JSON strings.
const HOUR = 60 * 60 * 1000;
export const inHours = (h: number) =>
    new Date(Date.now() + h * HOUR).toISOString();

let seq = 0;
export const id = (prefix: string) => `${prefix}-${++seq}`;

export const olympiad = (overrides: Record<string, unknown> = {}) => ({
    id: 'oly-1',
    name: 'Maths Olympiad 2026',
    organiser_id: 'org-user',
    timezone: 'Africa/Johannesburg',
    created_at: '2026-01-10T08:00:00.000Z',
    _count: { rounds: 2, school_registrations: 3 },
    ...overrides,
});

// GET /olympiads/:id/rounds item
export const organiserRound = (overrides: Record<string, unknown> = {}) => ({
    id: id('round'),
    olympiad_id: 'oly-1',
    name: 'Round 1',
    notes: null,
    opens_at: inHours(24),
    closes_at: inHours(26),
    results_release_at: null,
    state: 'scheduled',
    exam_status: 'draft',
    approved_by: null,
    approved_at: null,
    qualifying_threshold: null,
    created_at: '2026-01-10T08:00:00.000Z',
    _count: { submissions: 0, entrant_registrations: 0 },
    ...overrides,
});

// A question row as returned by /rounds/:id/questions
export const question = (overrides: Record<string, unknown> = {}) => ({
    id: id('q'),
    paper_id: 'paper-1',
    type: 'mcq',
    prompt: 'Which of these are prime?',
    options: ['2', '4', '5', '9'],
    correct_option: '0,2',
    correct_answer: null,
    negative_pct: '0',
    max_points: '2',
    created_at: '2026-01-10T08:00:00.000Z',
    ...overrides,
});

export const examStatus = (overrides: Record<string, unknown> = {}) => ({
    exam_status: 'draft',
    state: 'scheduled',
    question_count: 0,
    questions_by_type: {},
    paper_id: null as string | null,
    approved_by: null as string | null,
    approved_at: null as string | null,
    approved_by_name: null as string | null,
    ...overrides,
});

// GET /me
export const me = (
    role: 'organiser' | 'educator' | 'student',
    overrides: Record<string, unknown> = {}
) => ({
    user: {
        id: `${role}-user`,
        full_name:
            role === 'student'
                ? 'Ayanda Khumalo'
                : role === 'educator'
                  ? 'Sipho Dlamini'
                  : 'Thandi Mokoena',
        email: `${role}@olympiad.test`,
        role,
        created_at: '2026-01-10T08:00:00.000Z',
        school_memberships:
            role === 'educator'
                ? [
                      {
                          school_id: 'school-1',
                          role: 'coordinator',
                          status: 'active',
                          schools: { name: 'Parktown High' },
                      },
                  ]
                : [],
        educators:
            role === 'educator'
                ? {
                      school_id: 'school-1',
                      schools: { id: 'school-1', name: 'Parktown High' },
                  }
                : null,
        entrants:
            role === 'student'
                ? {
                      school_id: 'school-1',
                      status: 'active',
                      schools: { id: 'school-1', name: 'Parktown High' },
                  }
                : null,
        ...overrides,
    },
});

// GET /me/rounds item
export const educatorRound = (overrides: Record<string, unknown> = {}) => ({
    id: id('round'),
    name: 'Round 1',
    olympiad_id: 'oly-1',
    olympiad_name: 'Maths Olympiad 2026',
    timezone: 'Africa/Johannesburg',
    opens_at: inHours(-1),
    closes_at: inHours(5),
    state: 'open',
    status: 'open',
    has_paper: true,
    submission_count: 0,
    entrant_count: 12,
    ...overrides,
});

export const school = { id: 'school-1', name: 'Parktown High' };
