// @ts-nocheck
const express = require("express");
const { body, param } = require("express-validator");
const router = express.Router();
const { requireAuth, requireRole } = require("../middlewares/auth");
const validate = require("../middlewares/validate");
const {
  createSubmission,
  listSubmissions,
  getSubmission,
} = require("../controllers/submissionController");

// ── Validation rules ──────────────────────────────────

const createSubmissionRules = [
  param("roundId").isUUID(),
  body("entrant_id").isUUID().withMessage("entrant_id is required"),
  body("route")
    .optional()
    .isIn(["online", "offline"])
    .withMessage("route must be online or offline"),
  body("answers").isArray({ min: 1 }).withMessage("answers array is required"),
  body("answers.*.question_id").isUUID().withMessage("question_id is required"),
  body("answers.*.answer_value").optional().isString(),
];

// ── Routes ──────────────────────────────────────────

router.use(requireAuth);

// Create a submission — educators only
router.post(
  "/:roundId/submissions",
  requireRole("educator"),
  createSubmissionRules,
  validate,
  createSubmission,
);

// List submissions for a round — educator or organiser
router.get(
  "/:roundId/submissions",
  requireRole("educator", "organiser"),
  listSubmissions,
);

// Get a single submission — educator or organiser
router.get(
  "/:roundId/submissions/:id",
  requireRole("educator", "organiser"),
  getSubmission,
);

module.exports = router;
