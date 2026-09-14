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
} = require("../controllers/studentRoundController");

// All routes require authenticated student
router.use(requireAuth, requireRole("student"));

// GET /rounds/registered — list enrolled rounds + dashboard stats for the student
router.get("/registered", listRegisteredRounds);

// GET /rounds/:roundId/details - get detailed round information for the student
router.get(
  "/:roundId/details",
  [param("roundId").isUUID().withMessage("Valid round UUID required")],
  validate,
  getRoundDetail,
);

// GET /rounds/my-results — list completed/released round results for the student
router.get("/my-results", getStudentResults);

module.exports = router;
