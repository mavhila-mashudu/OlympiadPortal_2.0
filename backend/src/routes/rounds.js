// @ts-nocheck
const express = require('express');
const { body } = require('express-validator');
// mergeParams — needed to read :olympiadId from the parent router
const router = express.Router({ mergeParams: true });
const {
    createRound,
    listRounds,
    getRound,
    updateRound,
    deleteRound,
} = require('../controllers/roundController');
const { requireAuth, requireRole } = require('../middlewares/auth');
const validate = require('../middlewares/validate');

// ── Validation rules ────────────────────────────────────

const createRoundRules = [
    body('name').trim().notEmpty().withMessage('Round name is required'),
    body('opens_at').isISO8601().withMessage('opens_at must be a valid date'),
    body('closes_at').isISO8601().withMessage('closes_at must be a valid date'),
    body('qualifying_threshold')
        .optional({ values: 'null' })
        .isFloat({ min: 0, max: 100 })
        .withMessage('qualifying_threshold must be a percentage from 0 to 100'),
];

const updateRoundRules = [
    body('name').optional().trim().notEmpty(),
    body('opens_at').optional().isISO8601(),
    body('closes_at').optional().isISO8601(),
    body('qualifying_threshold')
        .optional({ values: 'null' })
        .isFloat({ min: 0, max: 100 })
        .withMessage('qualifying_threshold must be a percentage from 0 to 100'),
];

// ── Routes ────────────────────────────────────────────
// Nested under /olympiads/:olympiadId/rounds. Auth at router level; role
// per route — a router-level role guard would 403 requests meant for
// sibling routers sharing the /rounds prefix.

router.use(requireAuth);

router.post(
    '/',
    requireRole('organiser'),
    createRoundRules,
    validate,
    createRound
);
router.get('/', requireRole('organiser'), listRounds);

module.exports = router;
