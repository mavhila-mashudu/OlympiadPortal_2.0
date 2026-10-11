// @ts-nocheck
const express = require('express');
const { body, param, query } = require('express-validator');
const { requireAuth, requireRole } = require('../middlewares/auth');
const validate = require('../middlewares/validate');
const {
    createRateLimiter,
    publicAuthLimiter,
} = require('../middlewares/rateLimit');
const { checkInvitation } = require('../controllers/authController');
const service = require('../services/schoolInvitationService');

const router = express.Router();

// Public on purpose: the signup form checks a code before anyone has an
// account, so this route sits above the auth guard. /check is POST only and
// no POST /:invitationId exists, so the two cannot collide. Rate limited like
// signup itself: a code is secret, so guessing is capped.
router.post(
    '/check',
    publicAuthLimiter,
    [body('code').isString().isLength({ min: 1, max: 40 })],
    validate,
    checkInvitation
);

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
    '/:invitationId',
    [param('invitationId').isUUID()],
    validate,
    async (req, res, next) => {
        try {
            await service.revokeInvitation(req.user, req.params.invitationId);
            res.json({ success: true, data: {} });
        } catch (err) {
            next(err);
        }
    }
);

module.exports = router;
