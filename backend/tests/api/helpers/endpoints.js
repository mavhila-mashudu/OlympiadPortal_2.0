// Every endpoint of the hand-written API and who may call it.
//
//   roles: "public"   — no token needed
//          "any"      — any signed-in user
//          [..roles]  — only these roles (others get 403)
//
// tests/api/endpoints.test.js checks this list against the route files, so a
// new route can't be added without being listed (and access-tested) here.
const ORGANISER = ['organiser'];
const EDUCATOR = ['educator'];
const STUDENT = ['student'];
const STAFF = ['organiser', 'educator'];

const endpoints = [
    // App
    { method: 'get', path: '/health', roles: 'public' },
    { method: 'get', path: '/', roles: 'public' },

    // Public API (no auth)
    { method: 'get', path: '/public/stats', roles: 'public' },
    { method: 'get', path: '/public/stats/yearly', roles: 'public' },
    { method: 'get', path: '/public/activity', roles: 'public' },
    { method: 'get', path: '/public/calendar', roles: 'public' },
    { method: 'get', path: '/public/search', roles: 'public' },
    { method: 'get', path: '/public/olympiads', roles: 'public' },
    { method: 'get', path: '/public/olympiads/:olympiadId', roles: 'public' },
    {
        method: 'get',
        path: '/public/olympiads/:olympiadId/rounds/:roundId/results',
        roles: 'public',
    },
    {
        method: 'get',
        path: '/public/olympiads/:olympiadId/rounds/:roundId/results/by-school',
        roles: 'public',
    },
    {
        method: 'get',
        path: '/public/olympiads/:olympiadId/leaderboard',
        roles: 'public',
    },
    { method: 'get', path: '/public/schools/top', roles: 'public' },
    { method: 'get', path: '/public/schools', roles: 'public' },
    { method: 'get', path: '/public/schools/:schoolId', roles: 'public' },
    { method: 'get', path: '/public/papers', roles: 'public' },
    { method: 'get', path: '/public/papers/:paperId/download', roles: 'public' },

    // Portal notifications
    { method: 'get', path: '/me/notifications', roles: 'any' },
    {
        method: 'patch',
        path: '/me/notifications/:notificationId/read',
        roles: 'any',
    },

    // Marking review and remarks
    { method: 'get', path: '/rounds/:roundId/review-sample', roles: STAFF },
    {
        method: 'patch',
        path: '/rounds/:roundId/review-sample/:answerId',
        roles: STAFF,
    },
    { method: 'get', path: '/rounds/:roundId/remarks', roles: ORGANISER },
    { method: 'post', path: '/rounds/:roundId/remarks', roles: STUDENT },
    {
        method: 'get',
        path: '/rounds/:roundId/remarks/reviewers',
        roles: ORGANISER,
    },
    {
        method: 'post',
        path: '/rounds/:roundId/remarks/auto-assign',
        roles: ORGANISER,
    },
    // Auth
    { method: 'post', path: '/auth/register', roles: 'public' },
    { method: 'post', path: '/auth/forgot-password', roles: 'public' },
    { method: 'post', path: '/auth/logout', roles: 'any' },

    // Schools (public signup list)
    { method: 'get', path: '/schools', roles: 'public' },

    // The signed-in user
    { method: 'get', path: '/me', roles: 'any' },
    { method: 'delete', path: '/me', roles: 'any' },
    { method: 'get', path: '/me/rounds', roles: ['student', 'educator'] },
    {
        method: 'get',
        path: '/me/rounds/:roundId',
        roles: ['student', 'educator'],
    },
    { method: 'get', path: '/me/results', roles: ['student', 'educator'] },
    {
        method: 'get',
        path: '/me/rounds/:roundId/results',
        roles: EDUCATOR,
    },
    { method: 'get', path: '/me/rounds/:roundId/remark', roles: STUDENT },
    { method: 'get', path: '/me/overview', roles: EDUCATOR },
    { method: 'get', path: '/me/assigned-remarks', roles: EDUCATOR },
    { method: 'get', path: '/me/olympiads', roles: EDUCATOR },
    { method: 'get', path: '/me/olympiad-invitations', roles: 'any' },
    { method: 'get', path: '/me/sent-olympiad-invitations', roles: STAFF },
    {
        method: 'get',
        path: '/me/olympiad-invitation-candidates',
        roles: STAFF,
    },

    // School membership approval
    { method: 'get', path: '/membership-requests', roles: STAFF },
    {
        method: 'patch',
        path: '/membership-requests/:requestId',
        roles: STAFF,
    },

    // School signup codes (organiser or active educator, school-scoped)
    { method: 'get', path: '/school-invitations', roles: STAFF },
    { method: 'post', path: '/school-invitations', roles: STAFF },
    {
        method: 'delete',
        path: '/school-invitations/:invitationId',
        roles: STAFF,
    },
    // The signup form checks a code before any account exists
    { method: 'post', path: '/school-invitations/check', roles: 'public' },

    // Olympiad invitations (resource actions; list views live under /me)
    { method: 'post', path: '/olympiad-invitations', roles: STAFF },
    {
        method: 'post',
        path: '/olympiad-invitations/:invitationId/accept',
        roles: 'any',
    },
    {
        method: 'post',
        path: '/olympiad-invitations/:invitationId/reject',
        roles: 'any',
    },
    {
        method: 'delete',
        path: '/olympiad-invitations/:invitationId',
        roles: STAFF,
    },

    // Olympiads (organiser)
    { method: 'post', path: '/olympiads', roles: ORGANISER },
    { method: 'get', path: '/olympiads', roles: ORGANISER },
    { method: 'get', path: '/olympiads/:olympiadId', roles: ORGANISER },
    { method: 'patch', path: '/olympiads/:olympiadId', roles: ORGANISER },
    { method: 'delete', path: '/olympiads/:olympiadId', roles: ORGANISER },
    { method: 'get', path: '/olympiads/:olympiadId/schools', roles: ORGANISER },
    {
        method: 'get',
        path: '/olympiads/:olympiadId/papers/archive',
        roles: ORGANISER,
    },
    // School entrants and progression (educators)
    {
        method: 'post',
        path: '/olympiads/:olympiadId/entrants',
        roles: EDUCATOR,
    },
    {
        method: 'get',
        path: '/olympiads/:olympiadId/entrants',
        roles: EDUCATOR,
    },
    {
        method: 'get',
        path: '/olympiads/:olympiadId/progression',
        roles: EDUCATOR,
    },
    { method: 'get', path: '/rounds/:roundId/replay', roles: ORGANISER },
    { method: 'post', path: '/olympiads/:olympiadId/rounds', roles: ORGANISER },
    { method: 'get', path: '/olympiads/:olympiadId/rounds', roles: ORGANISER },
    {
        method: 'post',
        path: '/olympiads/:olympiadId/rounds/date-check',
        roles: ORGANISER,
    },
    {
        method: 'get',
        path: '/olympiads/:olympiadId/notification-rules',
        roles: ORGANISER,
    },
    {
        method: 'post',
        path: '/olympiads/:olympiadId/notification-rules',
        roles: ORGANISER,
    },
    {
        method: 'patch',
        path: '/olympiads/:olympiadId/notification-rules/:ruleId',
        roles: ORGANISER,
    },
    {
        method: 'delete',
        path: '/olympiads/:olympiadId/notification-rules/:ruleId',
        roles: ORGANISER,
    },
    {
        method: 'post',
        path: '/olympiads/:olympiadId/notification-rules/:ruleId/test',
        roles: ORGANISER,
    },

    // A single round (organiser)
    { method: 'get', path: '/rounds/:roundId', roles: ORGANISER },
    { method: 'patch', path: '/rounds/:roundId', roles: ORGANISER },
    { method: 'patch', path: '/rounds/:roundId/state', roles: ORGANISER },
    { method: 'delete', path: '/rounds/:roundId', roles: ORGANISER },

    // Round papers: upload, preview, download and the past-paper list
    { method: 'post', path: '/rounds/:roundId/papers', roles: ORGANISER },
    { method: 'get', path: '/rounds/:roundId/papers/preview', roles: STAFF },
    {
        method: 'get',
        path: '/rounds/:roundId/papers/download',
        roles: ['educator', 'student'],
    },
    { method: 'get', path: '/rounds/:roundId/papers/archive', roles: EDUCATOR },

    // Round entrants and progression (educator; school-scoped in the service)
    { method: 'post', path: '/rounds/:roundId/entrants', roles: EDUCATOR },
    { method: 'get', path: '/rounds/:roundId/entrants', roles: EDUCATOR },
    { method: 'get', path: '/rounds/:roundId/progression', roles: EDUCATOR },

    // Questions and exam verification
    { method: 'post', path: '/rounds/:roundId/questions', roles: STAFF },
    { method: 'get', path: '/rounds/:roundId/questions', roles: STAFF },
    { method: 'get', path: '/rounds/:roundId/question-bank', roles: ORGANISER },
    {
        method: 'post',
        path: '/rounds/:roundId/question-bank/import',
        roles: ORGANISER,
    },
    {
        method: 'patch',
        path: '/rounds/:roundId/questions/:questionId',
        roles: STAFF,
    },
    {
        method: 'delete',
        path: '/rounds/:roundId/questions/:questionId',
        roles: STAFF,
    },
    { method: 'get', path: '/rounds/:roundId/exam/status', roles: STAFF },
    { method: 'patch', path: '/rounds/:roundId/exam/status', roles: STAFF },

    // Papers
    { method: 'get', path: '/papers/archive', roles: ORGANISER },
    { method: 'get', path: '/papers/:paperId/download', roles: ORGANISER },

    // Submissions, marking and results
    { method: 'post', path: '/rounds/:roundId/submissions', roles: EDUCATOR },
    { method: 'get', path: '/rounds/:roundId/submissions', roles: STAFF },
    {
        method: 'get',
        path: '/rounds/:roundId/submissions/:submissionId',
        roles: STAFF,
    },
    { method: 'post', path: '/rounds/:roundId/auto-mark', roles: STAFF },
    { method: 'get', path: '/rounds/:roundId/marking-queue', roles: STAFF },
    { method: 'post', path: '/rounds/:roundId/results', roles: ORGANISER },
    { method: 'get', path: '/rounds/:roundId/standings', roles: ORGANISER },
    { method: 'patch', path: '/rounds/:roundId/answers/:answerId', roles: STAFF },

    // Remarks: the organiser decides, the assigned educator reviews
    { method: 'get', path: '/remarks', roles: ORGANISER },
    { method: 'post', path: '/remarks/:remarkId/decision', roles: ORGANISER },
    { method: 'put', path: '/remarks/:remarkId/assignee', roles: ORGANISER },
    { method: 'post', path: '/remarks/:remarkId/review', roles: EDUCATOR },
    { method: 'get', path: '/remarks/:remarkId/answers', roles: EDUCATOR },
    {
        method: 'patch',
        path: '/remarks/:remarkId/answers/:answerId',
        roles: EDUCATOR,
    },

    // Student portal
    { method: 'get', path: '/rounds/:roundId/certificate', roles: STUDENT },
    { method: 'get', path: '/rounds/:roundId/exam', roles: STUDENT },
    { method: 'post', path: '/rounds/:roundId/exam/start', roles: STUDENT },
    {
        method: 'patch',
        path: '/rounds/:roundId/exam/answers/:questionId',
        roles: STUDENT,
    },
    { method: 'post', path: '/rounds/:roundId/exam/submit', roles: STUDENT },
];

// Where each route file is mounted (see src/app.js and src/routes/olympiads.js)
const mounts = {
    'public.js': '/public',
    'me.js': '/me',
    'schools.js': '/schools',
    'portalNotifications.js': '/me/notifications',
    'reviews.js': '/rounds',
    'auth.js': '/auth',
    'membershipApprovals.js': '/membership-requests',
    'schoolInvitations.js': '/school-invitations',
    'olympiadInvitations.js': '/olympiad-invitations',
    'remarks.js': '/remarks',
    'olympiads.js': '/olympiads',
    'rounds.js': '/olympiads/:olympiadId/rounds',
    'notificationRules.js': '/olympiads/:olympiadId/notification-rules',
    'studentRounds.js': '/rounds',
    'studentExam.js': '/rounds',
    'questions.js': '/rounds',
    'examStatus.js': '/rounds',
    'submissions.js': '/rounds',
    'standings.js': '/rounds',
    'marking.js': '/rounds',
    'roundPapers.js': '/rounds',
    'roundDetail.js': '/rounds',
    'papers.js': '/papers',
};

module.exports = { endpoints, mounts };
