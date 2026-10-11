// @ts-nocheck
// One remark request and the workflow around it: the organiser decides it
// (approve a revised mark or reject the appeal) or assigns it to an educator
// from another school, who reviews the answers and concludes the review.
// The round-scoped views live under /rounds (a round's remarks, its
// reviewers, the auto-assign action) and /me (the student's own request,
// the educator's assigned list); this file holds the actions on one remark.
const express = require('express');
const { body, param, query } = require('express-validator');
const router = express.Router();
const { requireAuth, requireRole } = require('../middlewares/auth');
const validate = require('../middlewares/validate');
const {
    listRemarks,
    decideRemark,
    assignRemark,
} = require('../controllers/organiserRemarkController');
const {
    getRemarkSubmissionAnswers,
    updateRemarkAnswer,
    resolveRemark,
} = require('../controllers/educatorController');

router.use(requireAuth);

// All remarks across the organiser's rounds
router.get(
    '/',
    requireRole('organiser'),
    [
        query('olympiadId')
            .optional()
            .isUUID()
            .withMessage('olympiadId must be a valid UUID'),
        query('roundId')
            .optional()
            .isUUID()
            .withMessage('roundId must be a valid UUID'),
        query('status')
            .optional()
            .isIn(['all', 'unassigned', 'assigned', 'pending', 'reviewed'])
            .withMessage('Invalid status filter'),
    ],
    validate,
    listRemarks
);

// The organiser's decision: approve with revised points, or reject
router.post('/:remarkId/decision', requireRole('organiser'), decideRemark);

// Assign the remark to an educator from another school
router.put(
    '/:remarkId/assignee',
    requireRole('organiser'),
    [
        param('remarkId').isUUID().withMessage('remarkId must be a valid UUID'),
        body('reviewerId')
            .isUUID()
            .withMessage('reviewerId must be a valid educator user UUID'),
    ],
    validate,
    assignRemark
);

// The assigned educator's view: the answers to re-mark, a single re-mark,
// and the conclusion with an optional note
router.get(
    '/:remarkId/answers',
    requireRole('educator'),
    [param('remarkId').isUUID().withMessage('remarkId must be a valid UUID')],
    validate,
    getRemarkSubmissionAnswers
);
router.patch(
    '/:remarkId/answers/:answerId',
    requireRole('educator'),
    [
        param('remarkId').isUUID().withMessage('remarkId must be a valid UUID'),
        param('answerId').isUUID().withMessage('answerId must be a valid UUID'),
        body('points_awarded')
            .isNumeric()
            .withMessage('points_awarded must be a number'),
        body('is_correct')
            .optional()
            .isBoolean()
            .withMessage('is_correct must be a boolean'),
    ],
    validate,
    updateRemarkAnswer
);
router.post(
    '/:remarkId/review',
    requireRole('educator'),
    [
        param('remarkId').isUUID().withMessage('remarkId must be a valid UUID'),
        body('status')
            .isIn(['reviewed'])
            .withMessage('status must be reviewed'),
        body('review_note').optional().trim(),
    ],
    validate,
    resolveRemark
);

module.exports = router;
