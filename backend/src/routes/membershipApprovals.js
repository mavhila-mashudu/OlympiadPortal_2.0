// @ts-nocheck
const express = require('express');
const { body, param } = require('express-validator');
const { requireAuth, requireRole } = require('../middlewares/auth');
const validate = require('../middlewares/validate');
const service = require('../services/membershipApprovalService');

const router = express.Router();
router.use(requireAuth, requireRole('organiser', 'educator'));
router.get('/requests', async (req, res, next) => {
    try {
        const requests = await service.listRequests(req.user);
        res.json({ success: true, data: { requests } });
    } catch (err) { next(err); }
});
router.patch('/requests/:requestId', [
    param('requestId').isUUID(),
    body('decision').isIn(['approve','reject']),
], validate, async (req, res, next) => {
    try {
        const membership = await service.decideRequest(req.user, req.params.requestId, req.body.decision);
        res.json({ success: true, data: { membership } });
    } catch (err) { next(err); }
});
router.patch('/student-requests/:requestId', [
    param('requestId').isUUID(),
    body('decision').isIn(['approve','reject']),
    body('link_entrant_id').optional({ values: 'falsy' }).isUUID(),
], validate, async (req, res, next) => {
    try {
        const student = await service.decideStudentRequest(
            req.user, req.params.requestId, req.body.decision, req.body.link_entrant_id
        );
        res.json({ success: true, data: { student } });
    } catch (err) { next(err); }
});
module.exports = router;
