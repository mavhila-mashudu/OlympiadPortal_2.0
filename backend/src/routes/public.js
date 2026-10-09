// @ts-nocheck
const express = require('express');
const { param, query } = require('express-validator');
const validate = require('../middlewares/validate');
const {
    getPlatformStats,
    listOlympiads,
    getOlympiadDetail,
    getRoundResultsSummary,
    getRoundResultsBySchool,
    getOlympiadLeaderboard,
    listSchools,
    getSchoolDetail,
    listPapers,
    downloadPaper,
    getActivity,
    getYearlyStats,
    getCalendar,
    getTopSchools,
    unifiedSearch,
} = require('../controllers/publicController');

const router = express.Router();

// No auth middleware — all routes are publicly accessible.
//
// The data is public and the same for everyone, so browsers and CDNs may
// keep it for a minute and serve a stale copy for five more while fetching a
// fresh one. Other websites may embed the responses (helmet allows only this
// site by default).
router.use((_req, res, next) => {
    res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    res.set('Cross-Origin-Resource-Policy', 'cross-origin');
    next();
});

// Platform-wide stats
router.get('/stats', getPlatformStats);

// Yearly stats comparison
router.get('/stats/yearly', getYearlyStats);

// Recent platform activity
router.get('/activity', getActivity);

// Round calendar
router.get(
    '/calendar',
    [
        query('from')
            .optional()
            .isISO8601()
            .withMessage('from must be a valid ISO 8601 date'),
        query('to')
            .optional()
            .isISO8601()
            .withMessage('to must be a valid ISO 8601 date'),
    ],
    validate,
    getCalendar
);

// Unified search
router.get('/search', [query('q').optional().trim()], validate, unifiedSearch);

// List olympiads with optional filters
router.get(
    '/olympiads',
    [
        query('search').optional().trim(),
        query('year')
            .optional()
            .isInt({ min: 2000, max: 2100 })
            .withMessage('Year must be valid'),
        query('page')
            .optional()
            .isInt({ min: 1 })
            .withMessage('Page must be a positive integer'),
        query('limit')
            .optional()
            .isInt({ min: 1, max: 100 })
            .withMessage('Limit must be 1–100'),
        query('sort')
            .optional()
            .isIn(['name', 'created_at'])
            .withMessage("Sort must be 'name' or 'created_at'"),
    ],
    validate,
    listOlympiads
);

// Single olympiad detail
router.get(
    '/olympiads/:id',
    [param('id').isUUID().withMessage('Valid olympiad UUID required')],
    validate,
    getOlympiadDetail
);

// Round results summary (aggregated, no individual scores)
router.get(
    '/olympiads/:olympiadId/rounds/:roundId/results',
    [
        param('olympiadId')
            .isUUID()
            .withMessage('Valid olympiad UUID required'),
        param('roundId').isUUID().withMessage('Valid round UUID required'),
    ],
    validate,
    getRoundResultsSummary
);

// Round results broken down by school
router.get(
    '/olympiads/:olympiadId/rounds/:roundId/results/by-school',
    [
        param('olympiadId')
            .isUUID()
            .withMessage('Valid olympiad UUID required'),
        param('roundId').isUUID().withMessage('Valid round UUID required'),
    ],
    validate,
    getRoundResultsBySchool
);

// Olympiad leaderboard (schools ranked by average score)
router.get(
    '/olympiads/:id/leaderboard',
    [param('id').isUUID().withMessage('Valid olympiad UUID required')],
    validate,
    getOlympiadLeaderboard
);

// Top schools across all olympiads (declared before /schools/:id)
router.get(
    '/schools/top',
    [
        query('year')
            .optional()
            .isInt({ min: 2000, max: 2100 })
            .withMessage('Year must be valid'),
        query('limit')
            .optional()
            .isInt({ min: 1, max: 50 })
            .withMessage('Limit must be 1–50'),
    ],
    validate,
    getTopSchools
);

// List schools with optional search
router.get(
    '/schools',
    [
        query('search').optional().trim(),
        query('page')
            .optional()
            .isInt({ min: 1 })
            .withMessage('Page must be a positive integer'),
        query('limit')
            .optional()
            .isInt({ min: 1, max: 100 })
            .withMessage('Limit must be 1–100'),
    ],
    validate,
    listSchools
);

// Single school detail
router.get(
    '/schools/:id',
    [param('id').isUUID().withMessage('Valid school UUID required')],
    validate,
    getSchoolDetail
);

// Past papers archive
router.get(
    '/papers',
    [
        query('olympiad')
            .optional()
            .isUUID()
            .withMessage('Valid olympiad UUID required'),
        query('year')
            .optional()
            .isInt({ min: 2000, max: 2100 })
            .withMessage('Year must be valid'),
        query('page')
            .optional()
            .isInt({ min: 1 })
            .withMessage('Page must be a positive integer'),
        query('limit')
            .optional()
            .isInt({ min: 1, max: 100 })
            .withMessage('Limit must be 1–100'),
    ],
    validate,
    listPapers
);

// Download an archived paper or its memo: redirects to a short-lived link to
// the file, so the URLs in /papers keep working however long they are kept
router.get(
    '/papers/:id/download',
    [
        param('id').isUUID().withMessage('Valid paper UUID required'),
        query('type')
            .optional()
            .isIn(['paper', 'memo'])
            .withMessage("Type must be 'paper' or 'memo'"),
    ],
    validate,
    downloadPaper
);

module.exports = router;
