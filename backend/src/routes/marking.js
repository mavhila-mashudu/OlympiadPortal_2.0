// @ts-nocheck
const express = require("express");
const { body, param } = require("express-validator");
const router = express.Router();
const { requireAuth, requireRole } = require("../middlewares/auth");
const validate = require("../middlewares/validate");
const {
  markRound,
  markAnswer,
  generateResults,
} = require("../controllers/markingController");

// ── Validation rules ──────────────────────────────────

const markAnswerRules = [
  param("id").isUUID(),
  body("is_correct")
    .isBoolean()
    .withMessage("is_correct (boolean) is required"),
  body("points_awarded")
    .isFloat({ min: 0 })
    .withMessage("points_awarded must be >= 0"),
];

// ── Routes ──────────────────────────────────────────

router.use(requireAuth, requireRole("organiser"));

// Bulk auto-mark all received submissions in a round
router.post("/:roundId/mark", markRound);

// Generate final results with ranks + qualification
router.post("/:roundId/results", generateResults);

// Manually mark a single answer (non-MCQ)
router.patch("/:roundId/answers/:id", markAnswerRules, validate, markAnswer);

module.exports = router;
