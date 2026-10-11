// @ts-nocheck
const express = require('express');
const { body, param } = require('express-validator');
const router = express.Router();
const { requireAuth, requireRole } = require('../middlewares/auth');
const validate = require('../middlewares/validate');
const {
    listPastPapers,
    downloadPaper,
    listRemarks,
    getRemarkSubmissionAnswers,
    updateRemarkAnswer,
    resolveRemark,
} = require('../controllers/educatorController');

// All educator routes require authentication + educator role
router.use(requireAuth, requireRole('educator'));

// ── Papers (B7, B11) ───────────────────────────────
router.get('/rounds/:roundId/papers/past', listPastPapers);
router.get('/rounds/:roundId/paper/download', downloadPaper);

// ── Remarks ─────────────────────────────────────────
router.get('/remarks', listRemarks);
router.get(
    '/remarks/:remarkId/answers',
    [param('remarkId').isUUID().withMessage('remarkId must be a valid UUID')],
    validate,
    getRemarkSubmissionAnswers
);
router.patch(
    '/remarks/:remarkId/answers/:answerId',
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
router.patch(
    '/remarks/:remarkId',
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
