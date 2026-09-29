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

  // Public API (no auth)
  { method: "get", path: "/public/stats", roles: "public" },
  { method: "get", path: "/public/stats/yearly", roles: "public" },
  { method: "get", path: "/public/activity", roles: "public" },
  { method: "get", path: "/public/calendar", roles: "public" },
  { method: "get", path: "/public/search", roles: "public" },
  { method: "get", path: "/public/olympiads", roles: "public" },
  { method: "get", path: "/public/olympiads/:id", roles: "public" },
  { method: "get", path: "/public/olympiads/:olympiadId/rounds/:roundId/results", roles: "public" },
  { method: "get", path: "/public/olympiads/:olympiadId/rounds/:roundId/results/by-school", roles: "public" },
  { method: "get", path: "/public/olympiads/:id/leaderboard", roles: "public" },
  { method: "get", path: "/public/schools/top", roles: "public" },
  { method: "get", path: "/public/schools", roles: "public" },
  { method: "get", path: "/public/schools/:id", roles: "public" },
  { method: "get", path: "/public/papers", roles: "public" },

  // Portal notifications
  { method: "get", path: "/notifications", roles: "any" },
  { method: "patch", path: "/notifications/:id/read", roles: "any" },

  // Marking review and remarks
  { method: "get", path: "/rounds/:roundId/review-sample", roles: STAFF },
  { method: "patch", path: "/rounds/:roundId/review-sample/:answerId", roles: STAFF },
  { method: "get", path: "/rounds/:roundId/remarks", roles: ORGANISER },
  { method: "post", path: "/rounds/:roundId/remark", roles: STUDENT },
  { method: "get", path: "/rounds/:roundId/my-remark", roles: STUDENT },
  { method: "patch", path: "/rounds/:roundId/remarks/:remarkId", roles: ORGANISER },
  // Auth
  { method: "post", path: "/auth/register", roles: "public" },
  { method: "post", path: "/auth/register/organiser", roles: "public" },
  { method: "get", path: "/auth/schools", roles: "public" },
  { method: "post", path: "/auth/forgot-password", roles: "public" },
  { method: "get", path: "/auth/me", roles: "any" },
  { method: "post", path: "/auth/logout", roles: "any" },
  { method: "delete", path: "/auth/account", roles: "any" },
  { method: "get", path: "/auth/educator-olympiads", roles: EDUCATOR },

  // In-app olympiad invitations
  { method: "get", path: "/invites/mine", roles: "any" },
  { method: "post", path: "/invites/:inviteId/accept", roles: "any" },
  { method: "post", path: "/invites/:inviteId/reject", roles: "any" },
  { method: "get", path: "/invites/sent", roles: STAFF },
  { method: "get", path: "/invites/candidates", roles: STAFF },
  { method: "post", path: "/invites", roles: STAFF },
  { method: "delete", path: "/invites/:inviteId", roles: STAFF },

  // Olympiads (organiser)
  { method: "post", path: "/olympiads", roles: ORGANISER },
  { method: "get", path: "/olympiads", roles: ORGANISER },
  { method: "get", path: "/olympiads/:id", roles: ORGANISER },
  { method: "patch", path: "/olympiads/:id", roles: ORGANISER },
  { method: "delete", path: "/olympiads/:id", roles: ORGANISER },
  { method: "get", path: "/olympiads/:olympiadId/schools", roles: ORGANISER },
  { method: "get", path: "/olympiads/:olympiadId/archive", roles: ORGANISER },
  { method: "get", path: "/olympiads/archive", roles: ORGANISER },
  { method: "get", path: "/rounds/:id/replay", roles: ORGANISER },
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
  { method: "get", path: "/rounds/:roundId/question-bank", roles: ORGANISER },
  { method: "post", path: "/rounds/:roundId/question-bank/import", roles: ORGANISER },
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
  { method: "get", path: "/educator/overview", roles: EDUCATOR },
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
  { method: "get", path: "/educator/remarks", roles: EDUCATOR },
  { method: "get", path: "/educator/remarks/:remarkId/answers", roles: EDUCATOR },
  { method: "patch", path: "/educator/remarks/:remarkId/answers/:answerId", roles: EDUCATOR },
  { method: "patch", path: "/educator/remarks/:remarkId", roles: EDUCATOR },

  // Organiser remarks
  { method: "get", path: "/organiser/remarks", roles: ORGANISER },
  { method: "get", path: "/organiser/remarks/rounds/:roundId/educators", roles: ORGANISER },
  { method: "patch", path: "/organiser/remarks/:remarkId/assign", roles: ORGANISER },
  { method: "post", path: "/organiser/remarks/rounds/:roundId/auto-assign", roles: ORGANISER },

  // Student portal
  { method: "get", path: "/rounds/registered", roles: STUDENT },
  { method: "get", path: "/rounds/:roundId/details", roles: STUDENT },
  { method: "get", path: "/rounds/:roundId/certificate", roles: STUDENT },
  { method: "get", path: "/rounds/my-results", roles: STUDENT },
  { method: "get", path: "/rounds/:roundId/paper/download", roles: STUDENT },
  { method: "get", path: "/rounds/:roundId/exam", roles: STUDENT },
  { method: "post", path: "/rounds/:roundId/exam/start", roles: STUDENT },
  { method: "patch", path: "/rounds/:roundId/exam/answers/:qid", roles: STUDENT },
  { method: "post", path: "/rounds/:roundId/exam/submit", roles: STUDENT },
];

// Where each route file is mounted (see src/app.js and src/routes/olympiads.js)
const mounts = {
  "public.js": "/public",
  "portalNotifications.js": "/notifications",
  "reviews.js": "/rounds",
  "auth.js": "/auth",
  "invites.js": "/invites",
  "educator.js": "/educator",
  "organiserRemarks.js": "/organiser/remarks",
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

