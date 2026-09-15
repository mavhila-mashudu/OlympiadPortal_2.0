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
  param("roundId").isUUID().withMessage("roundId must be a valid UUID"),
  body("type")
    .trim()
    .notEmpty()
    .withMessage("Question type is required")
    .bail()
    .isIn(["mcq", "true_false", "short_answer", "essay"])
    .withMessage("type must be one of: mcq, true_false, short_answer, essay"),
  body("prompt").trim().notEmpty().withMessage("Prompt is required"),
  body("options").optional().isArray().withMessage("options must be an array"),
  correctOptionRule(),
  body("correct_answer").optional().isString().withMessage("correct_answer must be text"),
  negativePctRule(),
  body("max_points").optional().isFloat({ min: 0.01 }).withMessage("max_points must be a number greater than 0"),
];

const updateQuestionRules = [
  param("id").isUUID().withMessage("Question id must be a valid UUID"),
  body("type")
    .optional()
    .trim()
    .isIn(["mcq", "true_false", "short_answer", "essay"])
    .withMessage("type must be one of: mcq, true_false, short_answer, essay"),
  body("prompt").optional().trim().notEmpty().withMessage("Prompt can't be empty"),
  body("options").optional().isArray().withMessage("options must be an array"),
  correctOptionRule(),
  body("correct_answer").optional().isString().withMessage("correct_answer must be text"),
  negativePctRule(),
  body("max_points").optional().isFloat({ min: 0.01 }).withMessage("max_points must be a number greater than 0"),
];

// ── Routes ──────────────────────────────────────────
// Both organisers and educators can manage questions.
// Organiser ownership is checked in the service layer.
// Educator access is checked via school registration.

// Auth at router level; role per route. Role guards must NOT be applied
// with router.use — other routers are also mounted on /rounds in app.js,
// and a router-level guard would 403 their requests before Express
// falls through to them.
router.use(requireAuth);

// Create a question on a round's paper
router.post(
  "/:roundId/questions",
  requireRole("organiser", "educator"),
  createQuestionRules,
  validate,
  createQuestion,
);

// List questions for a round's paper
router.get("/:roundId/questions", requireRole("organiser", "educator"), listQuestions);

// Update a specific question
router.patch(
  "/:roundId/questions/:id",
  requireRole("organiser", "educator"),
  updateQuestionRules,
  validate,
  updateQuestion,
);

// Delete a specific question
router.delete(
  "/:roundId/questions/:id",
  requireRole("organiser", "educator"),
  deleteQuestion,
);

module.exports = router;
