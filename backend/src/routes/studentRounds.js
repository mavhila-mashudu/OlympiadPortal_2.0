// @ts-nocheck
const express = require("express");
const { param } = require("express-validator");
const router = express.Router();
const { requireAuth, requireRole } = require("../middlewares/auth");
const validate = require("../middlewares/validate");
const {
  listRegisteredRounds,
  getRoundDetail,
  getStudentResults,
  downloadPaper,
} = require("../controllers/studentRoundController");

// All routes require authenticated student
router.use(requireAuth);

// GET /rounds/registered — list enrolled rounds + dashboard stats for the student
router.get("/registered", requireRole("student"), listRegisteredRounds);

// GET /rounds/:roundId/details - get detailed round information for the student
router.get(
  "/:roundId/details",
  requireRole("student"),
  [param("roundId").isUUID().withMessage("Valid round UUID required")],
  validate,
  getRoundDetail,
);

// GET /rounds/:roundId/paper/download — signed link to the round's question paper
router.get(
  "/:roundId/paper/download",
  requireRole("student"),
  [param("roundId").isUUID().withMessage("Valid round UUID required")],
  validate,
  downloadPaper,
);

// GET /rounds/my-results — list completed/released round results for the student
router.get("/my-results", requireRole("student"), getStudentResults);

module.exports = router;
