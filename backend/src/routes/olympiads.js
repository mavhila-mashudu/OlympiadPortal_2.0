// @ts-nocheck
const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const {
    listSchools,
    listArchive,
    listSharedArchive,
} = require('../controllers/schoolController');
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
router.get('/archive', requireRole('organiser'), listSharedArchive);
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
router.get('/:olympiadId/archive', requireRole('organiser'), listArchive);

// Rounds are nested under their olympiad:
// /olympiads/:olympiadId/rounds
router.use('/:olympiadId/rounds', roundsRouter);
router.use('/:olympiadId/notification-rules', require('./notificationRules'));

module.exports = router;
