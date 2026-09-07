// @ts-nocheck
const express = require("express");
const router = express.Router();
const {
  downloadPaper,
  getRoundPaperUrl,
} = require("../controllers/paperController");
const { requireAuth, requireRole } = require("../middlewares/auth");

// Signed viewing URL for a round's paper or memo.
// Organisers see both; educators see the question paper only
// (the memo backs the organiser's verification).  Access is
// checked in the service.
router.get(
  "/by-round/:roundId",
  requireAuth,
  requireRole("organiser", "educator"),
  getRoundPaperUrl,
);

// Organiser-only direct download by paper id
router.use(requireAuth, requireRole("organiser"));
router.get("/:id/download", downloadPaper);

module.exports = router;
