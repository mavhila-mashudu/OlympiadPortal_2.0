const express = require('express');
const { param } = require('express-validator');
const { requireAuth, requireRole } = require('../middlewares/auth');
const validate = require('../middlewares/validate');
const { getStandings } = require('../controllers/standingsController');

const router = express.Router();

// Auth at router level; role per route. Role guards must NOT be applied
// with router.use — other routers are also mounted on /rounds in app.js,
// and a router-level guard would 403 their requests before Express
// falls through to them.
router.use(requireAuth);
router.get(
    '/:roundId/standings',
    requireRole('organiser'),
    [param('roundId').isUUID().withMessage('Valid round UUID required')],
    validate,
    getStandings
);

module.exports = router;
