// @ts-nocheck
const express = require('express');
const { body, param } = require('express-validator');
const router = express.Router();
const { listSchools, listArchive } = require('../controllers/schoolController');
const {
    createOlympiad,
    listOlympiads,
    getOlympiad,
    updateOlympiad,
    deleteOlympiad,
} = require('../controllers/olympiadController');
const { requireAuth, requireRole } = require('../middlewares/auth');
const validate = require('../middlewares/validate');
const { isValidTimeZone } = require('../utils/timezones');
const {
    registerEntrantsForOlympiad,
    listOlympiadEntrants,
    getOlympiadProgressionInfo,
} = require('../controllers/educatorController');
const roundsRouter = require('./rounds');

// === Validation rules ====

const createOlympiadRules = [
    body('name').trim().notEmpty().withMessage('Olympiad name is required'),
    // Round times are entered and shown in this zone; omitted means the default
    body('timezone')
        .optional()
        .custom(isValidTimeZone)
        .withMessage(
            'timezone must be an IANA timezone such as Africa/Johannesburg'
        ),
];

const updateOlympiadRules = [
    body('name')
        .optional()
        .trim()
        .notEmpty()
        .withMessage('Olympiad name is required'),
    body('timezone')
        .optional()
        .trim()
        .notEmpty()
        .withMessage('Timezone is required'),
];

// The educator registers their school's learners across the open rounds
const registerOlympiadEntrantsRules = [
    param('olympiadId')
        .isUUID()
        .withMessage('olympiadId must be a valid UUID'),
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

// === Routes ===
// Auth at router level; role per route. Role guards must NOT be applied
// with router.use — this prefix is shared with the educators' and
// students' olympiad routes, and a router-level guard would 403 their
// requests before Express falls through to them.

router.use(requireAuth);

router.post(
    '/',
    requireRole('organiser'),
    createOlympiadRules,
    validate,
    createOlympiad
);
router.get('/', requireRole('organiser'), listOlympiads);
router.get('/:olympiadId', requireRole('organiser'), getOlympiad);
router.patch(
    '/:olympiadId',
    requireRole('organiser'),
    updateOlympiadRules,
    validate,
    updateOlympiad
);
router.delete('/:olympiadId', requireRole('organiser'), deleteOlympiad);
router.get('/:olympiadId/schools', requireRole('organiser'), listSchools);
router.get(
    '/:olympiadId/papers/archive',
    requireRole('organiser'),
    listArchive
);

// School entrants and progression (educator). School access is checked in
// the service, exactly as it was when these routes lived under /educator.
router.post(
    '/:olympiadId/entrants',
    requireRole('educator'),
    registerOlympiadEntrantsRules,
    validate,
    registerEntrantsForOlympiad
);
router.get(
    '/:olympiadId/entrants',
    requireRole('educator'),
    listOlympiadEntrants
);
router.get(
    '/:olympiadId/progression',
    requireRole('educator'),
    getOlympiadProgressionInfo
);

// Rounds are nested under their olympiad:
// /olympiads/:olympiadId/rounds
router.use('/:olympiadId/rounds', roundsRouter);
router.use('/:olympiadId/notification-rules', require('./notificationRules'));

module.exports = router;
