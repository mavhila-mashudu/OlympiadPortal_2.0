// @ts-nocheck
const express = require('express');
const { body, param } = require('express-validator');
const router = express.Router();
const { requireAuth, requireRole } = require('../middlewares/auth');
const validate = require('../middlewares/validate');
const {
    markRound,
    markAnswer,
    generateResults,
    getMarkingQueue,
} = require('../controllers/markingController');

// ── Validation rules ──────────────────────────────────

const markAnswerRules = [
    param('answerId').isUUID(),
    body('is_correct')
        .isBoolean()
        .withMessage('is_correct (boolean) is required'),
    body('points_awarded')
        .isFloat({ min: 0 })
        .withMessage('points_awarded must be >= 0'),
];

// ── Routes ──────────────────────────────────────────

// Auth at router level; role per route. Role guards must NOT be applied
// with router.use — other routers are also mounted on /rounds in app.js,
// and a router-level guard would 403 their requests before Express
// falls through to them.
router.use(requireAuth);

// Bulk auto-mark all received submissions in a round
router.post('/:roundId/mark', requireRole('organiser', 'educator'), markRound);

// List unmarked (essay) answers awaiting manual marking
router.get(
    '/:roundId/marking-queue',
    requireRole('organiser', 'educator'),
    getMarkingQueue
);

// Generate final results with ranks + qualification (organiser only — global action)
router.post('/:roundId/results', requireRole('organiser'), generateResults);

// Manually mark a single answer (non-MCQ)
router.patch(
    '/:roundId/answers/:answerId',
    requireRole('organiser', 'educator'),
    markAnswerRules,
    validate,
    markAnswer
);

module.exports = router;
