// @ts-nocheck
const express = require('express');
const router = express.Router();
const { downloadPaper } = require('../controllers/paperController');
const { listSharedArchive } = require('../controllers/schoolController');
const { requireAuth, requireRole } = require('../middlewares/auth');

// Organiser-only: the shared past-paper archive, and direct downloads
// by paper id.  Access is checked in the service.
router.use(requireAuth, requireRole('organiser'));

// One archive of past papers shared by all of the organiser's olympiads
router.get('/archive', listSharedArchive);

// Signed direct download by paper id
router.get('/:paperId/download', downloadPaper);

module.exports = router;
