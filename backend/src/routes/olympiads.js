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
// All olympiad routes are organiser-only

router.use(requireAuth, requireRole('organiser'));

router.post('/', createOlympiadRules, validate, createOlympiad);
router.get('/', listOlympiads);
router.get('/archive', listSharedArchive);
router.get('/:id', getOlympiad);
router.patch('/:id', updateOlympiadRules, validate, updateOlympiad);
router.delete('/:id', deleteOlympiad);
router.get('/:olympiadId/schools', listSchools);
router.get('/:olympiadId/archive', listArchive);

// Rounds are nested under their olympiad:
// /olympiads/:olympiadId/rounds
router.use('/:olympiadId/rounds', roundsRouter);
router.use('/:olympiadId/notification-rules', require('./notificationRules'));

module.exports = router;
