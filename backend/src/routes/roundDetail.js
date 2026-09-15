// @ts-nocheck
const express = require("express");
const { body } = require("express-validator");
const router = express.Router();
const upload = require("../middlewares/upload");
const { uploadPapers } = require("../controllers/paperController");
const {
  getRound,
  updateRound,
  deleteRound,
  setRoundState,
  checkDates,
} = require("../controllers/roundController");
const { requireAuth, requireRole } = require("../middlewares/auth");
const validate = require("../middlewares/validate");

const updateRoundRules = [
  body("name").optional().trim().notEmpty(),
  body("opens_at").optional().isISO8601(),
  body("closes_at").optional().isISO8601(),
  body("notes").optional(),
  body("qualifying_threshold")
    .optional({ values: "null" })
    .isFloat({ min: 0 })
    .withMessage("qualifying_threshold must be a non-negative number"),
];

const setRoundStateRules = [
  body("state")
    .trim()
    .notEmpty()
    .withMessage("state is required")
    .isIn(["scheduled", "open", "closed", "marking", "results_released"])
    .withMessage("state must be a valid round state"),
];

const checkDatesRules = [
  body("opens_at").isISO8601().withMessage("opens_at must be a valid date"),
  body("closes_at").isISO8601().withMessage("closes_at must be a valid date"),
];

// ── Routes ──────────────────────────────────────────────

// Auth at router level; role per route. Role guards must NOT be applied
// with router.use — other routers are also mounted on /rounds in app.js,
// and a router-level guard would 403 their requests before Express
// falls through to them.
router.use(requireAuth);

// Static paths must come before /:id to avoid param capture.
router.post("/check-dates", requireRole("organiser"), checkDatesRules, validate, checkDates);

router.get("/:id", requireRole("organiser"), getRound);
router.patch("/:id", requireRole("organiser"), updateRoundRules, validate, updateRound);
router.patch("/:id/state", requireRole("organiser"), setRoundStateRules, validate, setRoundState);
router.delete("/:id", requireRole("organiser"), deleteRound);
router.post(
  "/:id/papers",
  requireRole("organiser"),
  upload.fields([
    { name: "paper", maxCount: 1 },
    { name: "memo", maxCount: 1 },
  ]),
  uploadPapers,
);

module.exports = router;
