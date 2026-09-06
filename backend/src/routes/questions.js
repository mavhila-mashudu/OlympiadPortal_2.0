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

const createQuestionRules = [
  param("roundId").isUUID(),
  body("type")
    .trim()
    .notEmpty()
    .withMessage("Question type is required")
    .isIn(["mcq", "short_answer", "essay"])
    .withMessage("type must be one of: mcq, short_answer, essay"),
  body("prompt").trim().notEmpty().withMessage("Prompt is required"),
  body("options").optional().isArray(),
  body("correct_option").optional().isString(),
  body("correct_answer").optional().isString(),
  body("max_points").optional().isFloat({ min: 0.01 }),
];

const updateQuestionRules = [
  param("id").isUUID(),
  body("type").optional().trim().isIn(["mcq", "short_answer", "essay"]),
  body("prompt").optional().trim().notEmpty(),
  body("options").optional().isArray(),
  body("correct_option").optional().isString(),
  body("correct_answer").optional().isString(),
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
