// @ts-nocheck
// Everything under /rounds/:roundId/papers*: uploading the paper, the
// signed preview URL, the download link (one URL for educator and
// student, dispatched by role), and the educator's past-paper list.
// Each handler keeps the guards it had at its previous URL.
const express = require('express');
const { param } = require('express-validator');
const router = express.Router();
const upload = require('../middlewares/upload');
const {
    uploadPapers,
    getRoundPaperUrl,
} = require('../controllers/paperController');
const {
    downloadPaper: educatorDownloadPaper,
    listPastPapers,
} = require('../controllers/educatorController');
const {
    downloadPaper: studentDownloadPaper,
} = require('../controllers/studentRoundController');
const { requireAuth, requireRole, byRole } = require('../middlewares/auth');
const validate = require('../middlewares/validate');

// Auth at router level; role per route. Role guards must NOT be applied
// with router.use — other routers are also mounted on /rounds in app.js,
// and a router-level guard would 403 their requests before Express
// falls through to them.
router.use(requireAuth);

// The organiser uploads the question paper and (optionally) its memo
router.post(
    '/:roundId/papers',
    requireRole('organiser'),
    upload.fields([
        { name: 'paper', maxCount: 1 },
        { name: 'memo', maxCount: 1 },
    ]),
    uploadPapers
);

// Signed viewing URL for a round's paper or memo.
// Organisers see both; educators see the question paper only
// (the memo backs the organiser's verification).  Access is
// checked in the service.
router.get(
    '/:roundId/papers/preview',
    requireRole('organiser', 'educator'),
    getRoundPaperUrl
);

// Signed download URL, dispatched by the caller's role: an educator gets
// the school's paper (memo access is denied in the service); a student
// gets their own registered round's question paper.
// School/registration access is checked in the service.
router.get(
    '/:roundId/papers/download',
    [param('roundId').isUUID().withMessage('Valid round UUID required')],
    validate,
    byRole({
        educator: educatorDownloadPaper,
        student: studentDownloadPaper,
    })
);

// The educator's past-paper list for a round
router.get(
    '/:roundId/papers/archive',
    requireRole('educator'),
    listPastPapers
);

module.exports = router;
