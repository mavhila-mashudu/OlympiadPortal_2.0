// @ts-nocheck
const express = require("express");
const { body, param } = require("express-validator");
const router = express.Router();
const { requireAuth, requireRole } = require("../middlewares/auth");
const validate = require("../middlewares/validate");
const {
  createQuestion,
  listQuestions,
  updateQuestion,
  deleteQuestion,
} = require("../controllers/questionController");

// ── Validation rules ──────────────────────────────────

// correct_option stores option indexes as a comma-separated
// string ("0,2,3") — a single index for single-answer MCQs,
// several for multi-answer MCQs.
const correctOptionRule = () =>
  body("correct_option")
    .optional()
    .isString()
    .custom((value) => {
      const parts = String(value)
        .split(",")
        .map((v) => v.trim());
      if (parts.some((p) => !/^\d+$/.test(p))) {
        throw new Error(
          "correct_option must be option indexes separated by commas (e.g. 0,2)",
        );
      }
      if (new Set(parts).size !== parts.length) {
        throw new Error("correct_option must not repeat an option index");
      }
      return true;
    });

// negative_pct — % of the question's max_points deducted per
// wrongly selected option.  0 (default) disables it.
const negativePctRule = () =>
  body("negative_pct")
    .optional()
    .isFloat({ min: 0, max: 100 })
    .withMessage("negative_pct must be a percentage between 0 and 100");

const createQuestionRules = [
  param("roundId").isUUID(),
  body("type")
    .trim()
    .notEmpty()
    .withMessage("Question type is required")
    .isIn(["mcq", "true_false", "short_answer", "essay"])
    .withMessage("type must be one of: mcq, true_false, short_answer, essay"),
  body("prompt").trim().notEmpty().withMessage("Prompt is required"),
  body("options").optional().isArray(),
  correctOptionRule(),
  body("correct_answer").optional().isString(),
  negativePctRule(),
  body("max_points").optional().isFloat({ min: 0.01 }),
];

const updateQuestionRules = [
  param("id").isUUID(),
  body("type")
    .optional()
    .trim()
    .isIn(["mcq", "true_false", "short_answer", "essay"]),
  body("prompt").optional().trim().notEmpty(),
  body("options").optional().isArray(),
  correctOptionRule(),
  body("correct_answer").optional().isString(),
  negativePctRule(),
  body("max_points").optional().isFloat({ min: 0.01 }),
];

// ── Routes ──────────────────────────────────────────
// Both organisers and educators can manage questions.
// Organiser ownership is checked in the service layer.
// Educator access is checked via school registration.

router.use(requireAuth, requireRole("organiser", "educator"));

// Create a question on a round's paper
router.post(
  "/:roundId/questions",
  createQuestionRules,
  validate,
  createQuestion,
);

// List questions for a round's paper
router.get("/:roundId/questions", listQuestions);

// Update a specific question
router.patch(
  "/:roundId/questions/:id",
  updateQuestionRules,
  validate,
  updateQuestion,
);

// Delete a specific question
router.delete("/:roundId/questions/:id", deleteQuestion);

module.exports = router;
