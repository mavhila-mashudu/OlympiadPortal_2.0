// Every endpoint of the hand-written API and who may call it.
//
//   roles: "public"   — no token needed
//          "any"      — any signed-in user
//          [..roles]  — only these roles (others get 403)
//
// tests/api/endpoints.test.js checks this list against the route files, so a
// new route can't be added without being listed (and access-tested) here.
const ORGANISER = ["organiser"];
const EDUCATOR = ["educator"];
const STUDENT = ["student"];
const STAFF = ["organiser", "educator"];

const endpoints = [
  // App
  { method: "get", path: "/health", roles: "public" },
  { method: "get", path: "/", roles: "public" },

  // Auth & invitations
  { method: "post", path: "/auth/register/organiser", roles: "public" },
  { method: "post", path: "/auth/register", roles: "public" },
  { method: "get", path: "/auth/validate-code/:code", roles: "public" },
  { method: "get", path: "/auth/validate-invite/:token", roles: "public" },
  { method: "get", path: "/auth/me", roles: "any" },
  { method: "delete", path: "/auth/account", roles: "any" },
  { method: "post", path: "/auth/invite-school", roles: ORGANISER },
  { method: "get", path: "/auth/educator-olympiads", roles: EDUCATOR },
  { method: "get", path: "/auth/student-invitations", roles: EDUCATOR },
  { method: "post", path: "/auth/invite-student", roles: EDUCATOR },
  { method: "post", path: "/auth/invite-educator", roles: EDUCATOR },
  { method: "post", path: "/auth/generate-student-codes", roles: EDUCATOR },

  // Olympiads (organiser)
  { method: "post", path: "/olympiads", roles: ORGANISER },
  { method: "get", path: "/olympiads", roles: ORGANISER },
  { method: "get", path: "/olympiads/:id", roles: ORGANISER },
  { method: "patch", path: "/olympiads/:id", roles: ORGANISER },
  { method: "delete", path: "/olympiads/:id", roles: ORGANISER },
  { method: "get", path: "/olympiads/:olympiadId/schools", roles: ORGANISER },
  { method: "get", path: "/olympiads/:olympiadId/archive", roles: ORGANISER },
  { method: "post", path: "/olympiads/:olympiadId/rounds", roles: ORGANISER },
  { method: "get", path: "/olympiads/:olympiadId/rounds", roles: ORGANISER },
  { method: "get", path: "/olympiads/:olympiadId/notification-rules", roles: ORGANISER },
  { method: "post", path: "/olympiads/:olympiadId/notification-rules", roles: ORGANISER },
  { method: "patch", path: "/olympiads/:olympiadId/notification-rules/:ruleId", roles: ORGANISER },
  { method: "delete", path: "/olympiads/:olympiadId/notification-rules/:ruleId", roles: ORGANISER },
  { method: "post", path: "/olympiads/:olympiadId/notification-rules/:ruleId/test", roles: ORGANISER },

  // A single round (organiser)
  { method: "post", path: "/rounds/check-dates", roles: ORGANISER },
  { method: "get", path: "/rounds/:id", roles: ORGANISER },
  { method: "patch", path: "/rounds/:id", roles: ORGANISER },
  { method: "patch", path: "/rounds/:id/state", roles: ORGANISER },
  { method: "delete", path: "/rounds/:id", roles: ORGANISER },
  { method: "post", path: "/rounds/:id/papers", roles: ORGANISER },

  // Questions and exam verification
  { method: "post", path: "/rounds/:roundId/questions", roles: STAFF },
  { method: "get", path: "/rounds/:roundId/questions", roles: STAFF },
  { method: "patch", path: "/rounds/:roundId/questions/:id", roles: STAFF },
  { method: "delete", path: "/rounds/:roundId/questions/:id", roles: STAFF },
  { method: "get", path: "/rounds/:roundId/exam-status", roles: STAFF },
  { method: "patch", path: "/rounds/:roundId/exam-status", roles: STAFF },

  // Papers
  { method: "get", path: "/papers/by-round/:roundId", roles: STAFF },
  { method: "get", path: "/papers/:id/download", roles: ORGANISER },

  // Submissions, marking and results
  { method: "post", path: "/rounds/:roundId/submissions", roles: EDUCATOR },
  { method: "get", path: "/rounds/:roundId/submissions", roles: STAFF },
  { method: "get", path: "/rounds/:roundId/submissions/:id", roles: STAFF },
  { method: "post", path: "/rounds/:roundId/mark", roles: STAFF },
  { method: "get", path: "/rounds/:roundId/marking-queue", roles: STAFF },
  { method: "post", path: "/rounds/:roundId/results", roles: ORGANISER },
  { method: "get", path: "/rounds/:roundId/standings", roles: ORGANISER },
  { method: "patch", path: "/rounds/:roundId/answers/:id", roles: STAFF },

  // Educator portal
  { method: "get", path: "/educator/rounds", roles: EDUCATOR },
  { method: "get", path: "/educator/rounds/:roundId", roles: EDUCATOR },
  { method: "post", path: "/educator/rounds/:roundId/entrants", roles: EDUCATOR },
  { method: "get", path: "/educator/rounds/:roundId/entrants", roles: EDUCATOR },
  { method: "get", path: "/educator/rounds/:roundId/progression", roles: EDUCATOR },
  { method: "post", path: "/educator/olympiads/:olympiadId/entrants", roles: EDUCATOR },
  { method: "get", path: "/educator/olympiads/:olympiadId/entrants", roles: EDUCATOR },
  { method: "get", path: "/educator/olympiads/:olympiadId/progression", roles: EDUCATOR },
  { method: "get", path: "/educator/rounds/:roundId/results", roles: EDUCATOR },
  { method: "get", path: "/educator/results", roles: EDUCATOR },
  { method: "get", path: "/educator/rounds/:roundId/papers/past", roles: EDUCATOR },
  { method: "get", path: "/educator/rounds/:roundId/paper/download", roles: EDUCATOR },

  // Student portal
  { method: "get", path: "/rounds/registered", roles: STUDENT },
  { method: "get", path: "/rounds/:roundId/details", roles: STUDENT },
  { method: "get", path: "/rounds/my-results", roles: STUDENT },
  { method: "get", path: "/rounds/:roundId/paper/download", roles: STUDENT },
  { method: "get", path: "/rounds/:roundId/exam", roles: STUDENT },
  { method: "post", path: "/rounds/:roundId/exam/start", roles: STUDENT },
  { method: "patch", path: "/rounds/:roundId/exam/answers/:qid", roles: STUDENT },
  { method: "post", path: "/rounds/:roundId/exam/submit", roles: STUDENT },
];

// Where each route file is mounted (see src/app.js and src/routes/olympiads.js)
const mounts = {
  "auth.js": "/auth",
  "educator.js": "/educator",
  "olympiads.js": "/olympiads",
  "rounds.js": "/olympiads/:olympiadId/rounds",
  "notificationRules.js": "/olympiads/:olympiadId/notification-rules",
  "studentRounds.js": "/rounds",
  "studentExam.js": "/rounds",
  "questions.js": "/rounds",
  "examStatus.js": "/rounds",
  "submissions.js": "/rounds",
  "standings.js": "/rounds",
  "marking.js": "/rounds",
  "roundDetail.js": "/rounds",
  "papers.js": "/papers",
};

module.exports = { endpoints, mounts };
