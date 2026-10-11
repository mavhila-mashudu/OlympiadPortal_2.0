// @ts-nocheck
const express = require('express');
const { body, param } = require('express-validator');
const { requireAuth, requireRole } = require('../middlewares/auth');
const validate = require('../middlewares/validate');
const service = require('../services/membershipApprovalService');

const router = express.Router();
router.use(requireAuth, requireRole('organiser', 'educator'));

// Pending staff and student memberships: the organiser sees schools that have
// no coordinator yet, a coordinator sees their own school's queue.
router.get('/', async (req, res, next) => {
    try {
        const requests = await service.listRequests(req.user);
        res.json({ success: true, data: { requests } });
    } catch (err) { next(err); }
});

// One decision endpoint for both kinds of request — the id decides whether a
// staff membership or a student signup is being approved or rejected.
router.patch('/:requestId', [
    param('requestId').isUUID(),
    body('decision').isIn(['approve','reject']),
    body('link_entrant_id').optional({ values: 'falsy' }).isUUID(),
], validate, async (req, res, next) => {
    try {
        const decided = await service.decideRequestById(
            req.user, req.params.requestId, req.body.decision, req.body.link_entrant_id
        );
        res.json({ success: true, data: decided });
    } catch (err) { next(err); }
});
module.exports = router;
