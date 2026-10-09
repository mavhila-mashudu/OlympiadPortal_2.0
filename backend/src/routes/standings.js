const express = require('express');
const { param } = require('express-validator');
const { requireAuth, requireRole } = require('../middlewares/auth');
const validate = require('../middlewares/validate');
const { getStandings } = require('../controllers/standingsController');

const router = express.Router();

router.use(requireAuth, requireRole('organiser'));
router.get(
    '/:roundId/standings',
    [param('roundId').isUUID().withMessage('Valid round UUID required')],
    validate,
    getStandings
);

module.exports = router;
