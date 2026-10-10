// @ts-nocheck
const express = require('express');
const { body, param, query } = require('express-validator');
const { requireAuth, requireRole } = require('../middlewares/auth');
const validate = require('../middlewares/validate');
const { createRateLimiter } = require('../middlewares/rateLimit');
const service = require('../services/schoolInvitationService');

const router = express.Router();

// Organisers and active educators, limited to their own school in the service
router.use(requireAuth, requireRole('organiser', 'educator'));

// Each invitation sends an email, so how fast one person can send is capped
const sendLimiter = createRateLimiter({
    windowMs: 60 * 60 * 1000,
    limit: 30,
    message: 'Too many invitations sent. Please try again in a while.',
});

router.get(
    '/',
    [query('school_id').optional({ values: 'falsy' }).isUUID()],
    validate,
    async (req, res, next) => {
        try {
            const invitations = await service.listInvitations(req.user, {
                schoolId: req.query.school_id,
            });
            res.json({ success: true, data: { invitations } });
        } catch (err) {
            next(err);
        }
    }
);

router.post(
    '/',
    sendLimiter,
    [
        body('email').trim().isEmail().withMessage('Valid email required').toLowerCase(),
        body('school_id').optional({ values: 'falsy' }).isUUID(),
        body('account_type').optional().isIn(['educator', 'student']),
    ],
    validate,
    async (req, res, next) => {
        try {
            const result = await service.createInvitation(req.user, {
                email: req.body.email,
                schoolId: req.body.school_id,
                accountType: req.body.account_type || 'educator',
            });
            res.status(201).json({ success: true, data: result });
        } catch (err) {
            next(err);
        }
    }
);

router.delete(
    '/:id',
    [param('id').isUUID()],
    validate,
    async (req, res, next) => {
        try {
            await service.revokeInvitation(req.user, req.params.id);
            res.json({ success: true, data: {} });
        } catch (err) {
            next(err);
        }
    }
);

module.exports = router;
