// @ts-nocheck
const express = require("express");
const { param } = require("express-validator");
const router = express.Router();
const { requireAuth, requireRole } = require("../middlewares/auth");
const validate = require("../middlewares/validate");
const {
  listRegisteredRounds,
} = require("../controllers/studentRoundController");

// All routes require authenticated student
router.use(requireAuth, requireRole("student"));

// GET /rounds/registered — list enrolled rounds + dashboard stats for the student
router.get("/registered", listRegisteredRounds);


module.exports = router;
