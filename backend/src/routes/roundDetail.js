// @ts-nocheck
const express = require('express');
const { body, param } = require('express-validator');
const router = express.Router();
const {
    registerEntrants,
    listEntrants,
    getProgressionInfo,
} = require('../controllers/educatorController');
const {
    getRound,
    updateRound,
    deleteRound,
    setRoundState,
} = require('../controllers/roundController');
const { requireAuth, requireRole } = require('../middlewares/auth');
const validate = require('../middlewares/validate');

// Same checks as creating a round (routes/rounds.js)
const updateRoundRules = [
    body('name')
        .optional()
        .trim()
        .notEmpty()
        .withMessage("Round name can't be empty"),
    body('opens_at')
        .optional()
        .isISO8601()
        .withMessage('opens_at must be a valid date'),
    body('closes_at')
        .optional()
        .isISO8601()
        .withMessage('closes_at must be a valid date'),
    body('notes').optional(),
    body('qualifying_threshold')
        .optional({ values: 'null' })
        .isFloat({ min: 0, max: 100 })
        .withMessage('qualifying_threshold must be a percentage from 0 to 100'),
];

const setRoundStateRules = [
    body('state')
        .trim()
        .notEmpty()
        .withMessage('state is required')
        .isIn(['scheduled', 'open', 'closed', 'marking', 'results_released'])
        .withMessage('state must be a valid round state'),
];

// The educator registers their school's learners for the round
const registerEntrantsRules = [
    param('roundId').isUUID().withMessage('roundId must be a valid UUID'),
    body('entrants')
        .isArray({ min: 1 })
        .withMessage('entrants array with at least one entry is required'),
    body('entrants.*.full_name')
        .isString()
        .withMessage('full_name is required')
        .bail()
        .trim()
        .notEmpty()
        .withMessage('full_name is required'),
    body('entrants.*.grade').optional(),
    body('entrants.*.external_ref')
        .optional()
        .isString()
        .withMessage('external_ref must be text'),
];

// ── Routes ──────────────────────────────────────────────

// Auth at router level; role per route. Role guards must NOT be applied
// with router.use — other routers are also mounted on /rounds in app.js,
// and a router-level guard would 403 their requests before Express
// falls through to them.
router.use(requireAuth);

router.get('/:roundId', requireRole('organiser'), getRound);
router.get(
    '/:roundId/replay',
    requireRole('organiser'),
    async (req, res, next) => {
        try {
            const data =
                await require('../services/roundAuditService').replayRound(
                    req.params.roundId,
                    req.user.userId
                );
            res.json({ success: true, data });
        } catch (error) {
            next(error);
        }
    }
);
router.patch(
    '/:roundId',
    requireRole('organiser'),
    updateRoundRules,
    validate,
    updateRound
);
router.patch(
    '/:roundId/state',
    requireRole('organiser'),
    setRoundStateRules,
    validate,
    setRoundState
);
router.delete('/:roundId', requireRole('organiser'), deleteRound);

// ── Entrants and progression (educator) ─────────────────
// The educator registers their school's learners and follows the
// qualification funnel. School access is checked in the service, exactly as
// it was when these routes lived under /educator.
router.post(
    '/:roundId/entrants',
    requireRole('educator'),
    registerEntrantsRules,
    validate,
    registerEntrants
);
router.get('/:roundId/entrants', requireRole('educator'), listEntrants);
router.get(
    '/:roundId/progression',
    requireRole('educator'),
    getProgressionInfo
);

module.exports = router;
