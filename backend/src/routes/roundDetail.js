// @ts-nocheck
const express = require("express");
const { body } = require("express-validator");
const router = express.Router();
const upload = require("../middlewares/upload");
const { uploadPapers } = require("../controllers/paperController");
const {
  getRound,
  updateRound,
  deleteRound,
} = require("../controllers/roundController");
const { requireAuth, requireRole } = require("../middlewares/auth");
const validate = require("../middlewares/validate");

const updateRoundRules = [
  body("name").optional().trim().notEmpty(),
  body("opens_at").optional().isISO8601(),
  body("closes_at").optional().isISO8601(),
];

// ── Routes ──────────────────────────────────────────────

router.use(requireAuth, requireRole("organiser"));

router.get("/:id", getRound);
router.patch("/:id", updateRoundRules, validate, updateRound);
router.delete("/:id", deleteRound);
router.post(
  "/:id/papers",
  upload.fields([{ name: "paper", maxCount: 1 }, { name: "memo", maxCount: 1 }]),
  uploadPapers,
);

module.exports = router;