// @ts-nocheck
// In-app olympiad invitations: create, answer or withdraw a single
// invitation. The caller-specific lists (received and sent) live under /me —
// see routes/me.js.
const express = require('express');
const { body, param } = require('express-validator');
const {
    createInvite,
    acceptInvite,
    rejectInvite,
    cancelInvite,
} = require('../controllers/inviteController');
const { requireAuth, requireRole } = require('../middlewares/auth');
const validate = require('../middlewares/validate');

const router = express.Router();

router.use(requireAuth);

const invitationIdRule = [
    param('invitationId').isUUID().withMessage('Valid invitation id required'),
];
const createInviteRules = [
    body('olympiad_id').isUUID().withMessage('Valid olympiad id required'),
    body('invitee_id').isUUID().withMessage('Select someone to invite'),
    body('message')
        .optional({ values: 'falsy' })
        .isLength({ max: 500 })
        .withMessage('Message is too long'),
];

// Organisers invite educators to their own olympiads; educators invite the
// students of their own school.
router.post(
    '/',
    requireRole('organiser', 'educator'),
    createInviteRules,
    validate,
    createInvite
);

// Actions on a single invitation: any signed-in user, since the invitee
// answers it and the service checks it was addressed to them.
router.post('/:invitationId/accept', invitationIdRule, validate, acceptInvite);
router.post('/:invitationId/reject', invitationIdRule, validate, rejectInvite);
router.delete(
    '/:invitationId',
    requireRole('organiser', 'educator'),
    invitationIdRule,
    validate,
    cancelInvite
);

module.exports = router;
