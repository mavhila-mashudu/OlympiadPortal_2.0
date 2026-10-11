// @ts-nocheck
// Everything under /me describes the signed-in user: their profile and account
// (moved here from /auth), and their own view of rounds, results and school
// data. Each handler keeps the guards it had at its previous URL.
const express = require('express');
const {
    requireAuth,
    requireRole,
    requireSchoolMembership,
    byRole,
} = require('../middlewares/auth');
const {
    me,
    deleteAccount,
    getEducatorOlympiads,
} = require('../controllers/authController');
const {
    listRegisteredRounds,
    getStudentResults,
} = require('../controllers/studentRoundController');
const {
    listRounds,
    listAllResults,
    getOverview,
} = require('../controllers/educatorController');

const router = express.Router();

router.use(requireAuth);

// ── Profile and account ─────────────────────────────────
router.get('/', me);
router.delete('/', deleteAccount);

// ── Rounds and results (one URL, one meaning per role) ──
// Students see the rounds they are registered for and their own results;
// educators see their school's rounds and every entrant's results.
router.get(
    '/rounds',
    byRole({ student: listRegisteredRounds, educator: listRounds })
);
router.get(
    '/results',
    byRole({ student: getStudentResults, educator: listAllResults })
);

// ── Educator extras ─────────────────────────────────────
router.get('/overview', requireRole('educator'), getOverview);
router.get(
    '/olympiads',
    requireRole('educator'),
    requireSchoolMembership('coordinator', 'educator'),
    getEducatorOlympiads
);

module.exports = router;
