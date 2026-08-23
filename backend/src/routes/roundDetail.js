// @ts-nocheck
const express = require("express");
const { body } = require("express-validator");
const router = express.Router();
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
// Mounted at /rounds — a round's identity doesn't depend on
// nesting under its olympiad once you already have its id.
// Organiser-only for now; educators/students get their own
// read routes later (paper download, submission, etc.).

router.use(requireAuth, requireRole("organiser"));

router.get("/:id", getRound);
router.patch("/:id", updateRoundRules, validate, updateRound);
router.delete("/:id", deleteRound);

module.exports = router;
