// @ts-nocheck
const express = require("express");
const { body } = require("express-validator");
// mergeParams — needed to read :olympiadId from the parent router
const router = express.Router({ mergeParams: true });
const {
  createRound,
  listRounds,
  getRound,
  updateRound,
  deleteRound,
} = require("../controllers/roundController");
const { requireAuth, requireRole } = require("../middlewares/auth");
const validate = require("../middlewares/validate");

// ── Validation rules ────────────────────────────────────

const createRoundRules = [
  body("name").trim().notEmpty().withMessage("Round name is required"),
  body("opens_at").isISO8601().withMessage("opens_at must be a valid date"),
  body("closes_at").isISO8601().withMessage("closes_at must be a valid date"),
];

const updateRoundRules = [
  body("name").optional().trim().notEmpty(),
  body("opens_at").optional().isISO8601(),
  body("closes_at").optional().isISO8601(),
];

// ── Routes ──────────────────────────────────────────────
// Auth + role are already applied by the parent /olympiads
// router, but this router can also be reached standalone
// via /rounds/:id for get/update/delete, so guard again here.

router.use(requireAuth, requireRole("organiser"));

router.post("/", createRoundRules, validate, createRound);
router.get("/", listRounds);

module.exports = router;
