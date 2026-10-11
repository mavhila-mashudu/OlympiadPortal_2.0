// @ts-nocheck
// Everything under /me describes the signed-in user: their profile and account
// (moved here from /auth), and their own view of rounds, results, invitations
// and school data. Each handler keeps the guards it had at its previous URL.
const express = require('express');
const { query } = require('express-validator');
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
const {
    listMyInvites,
    listSentInvites,
    listCandidates,
} = require('../controllers/inviteController');
const validate = require('../middlewares/validate');

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

// ── Olympiad invitations ────────────────────────────────
// The caller-specific lists; creating and answering an invitation stay on
// the resource URL, /olympiad-invitations.
const olympiadQueryRule = [
    query('olympiad_id').isUUID().withMessage('Valid olympiad id required'),
];

// Invitations addressed to the signed-in user, shown on their dashboard.
router.get('/olympiad-invitations', listMyInvites);
// Invitations the signed-in user has sent. Organisers invite educators to
// their own olympiads; educators invite the students of their own school.
router.get(
    '/sent-olympiad-invitations',
    requireRole('organiser', 'educator'),
    listSentInvites
);
router.get(
    '/olympiad-invitation-candidates',
    requireRole('organiser', 'educator'),
    olympiadQueryRule,
    validate,
    listCandidates
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
