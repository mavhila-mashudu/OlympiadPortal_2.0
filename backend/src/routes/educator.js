// @ts-nocheck
const express = require("express");
const { body, param } = require("express-validator");
const router = express.Router();
const { requireAuth, requireRole } = require("../middlewares/auth");
const validate = require("../middlewares/validate");
const {
  listRounds,
  getRound,
  registerEntrants,
  registerEntrantsForOlympiad,
  listEntrants,
  listOlympiadEntrants,
  getProgressionInfo,
  getOlympiadProgressionInfo,
  getResults,
  listAllResults,
  getOverview,
  listPastPapers,
  downloadPaper,
  listRemarks,
  getRemarkSubmissionAnswers,
  updateRemarkAnswer,
  resolveRemark,
} = require("../controllers/educatorController");

// All educator routes require authentication + educator role
router.use(requireAuth, requireRole("educator"));

// ── School overview (I19) ───────────────────────────────
router.get("/overview", getOverview);

// ── Rounds ──────────────────────────────────────────
router.get("/rounds", listRounds);
router.get("/rounds/:roundId", getRound);

// ── Entrants (B4) ───────────────────────────────────
const registerEntrantsRules = [
  param("roundId").isUUID().withMessage("roundId must be a valid UUID"),
  body("entrants")
    .isArray({ min: 1 })
    .withMessage("entrants array with at least one entry is required"),
  body("entrants.*.full_name")
    .isString()
    .withMessage("full_name is required")
    .bail()
    .trim()
    .notEmpty()
    .withMessage("full_name is required"),
  body("entrants.*.grade").optional(),
  body("entrants.*.external_ref").optional().isString().withMessage("external_ref must be text"),
];

router.post(
  "/rounds/:roundId/entrants",
  registerEntrantsRules,
  validate,
  registerEntrants,
);
router.get("/rounds/:roundId/entrants", listEntrants);
router.get("/rounds/:roundId/progression", getProgressionInfo);

// ── Olympiad-level Entrants ─────────────────────────
const registerOlympiadEntrantsRules = [
  param("olympiadId").isUUID().withMessage("olympiadId must be a valid UUID"),
  body("entrants")
    .isArray({ min: 1 })
    .withMessage("entrants array with at least one entry is required"),
  body("entrants.*.full_name")
    .isString()
    .withMessage("full_name is required")
    .bail()
    .trim()
    .notEmpty()
    .withMessage("full_name is required"),
  body("entrants.*.grade").optional(),
  body("entrants.*.external_ref").optional().isString().withMessage("external_ref must be text"),
];

router.post(
  "/olympiads/:olympiadId/entrants",
  registerOlympiadEntrantsRules,
  validate,
  registerEntrantsForOlympiad,
);
router.get("/olympiads/:olympiadId/entrants", listOlympiadEntrants);
router.get("/olympiads/:olympiadId/progression", getOlympiadProgressionInfo);

// ── Results (B15) ───────────────────────────────────
router.get("/rounds/:roundId/results", getResults);
router.get("/results", listAllResults);

// ── Papers (B7, B11) ───────────────────────────────
router.get("/rounds/:roundId/papers/past", listPastPapers);
router.get("/rounds/:roundId/paper/download", downloadPaper);

// ── Remarks ─────────────────────────────────────────
router.get("/remarks", listRemarks);
router.get(
  "/remarks/:remarkId/answers",
  [param("remarkId").isUUID().withMessage("remarkId must be a valid UUID")],
  validate,
  getRemarkSubmissionAnswers,
);
router.patch(
  "/remarks/:remarkId/answers/:answerId",
  [
    param("remarkId").isUUID().withMessage("remarkId must be a valid UUID"),
    param("answerId").isUUID().withMessage("answerId must be a valid UUID"),
    body("points_awarded").isNumeric().withMessage("points_awarded must be a number"),
    body("is_correct").optional().isBoolean().withMessage("is_correct must be a boolean"),
  ],
  validate,
  updateRemarkAnswer,
);
router.patch(
  "/remarks/:remarkId",
  [
    param("remarkId").isUUID().withMessage("remarkId must be a valid UUID"),
    body("status").isIn(["reviewed"]).withMessage("status must be reviewed"),
    body("review_note").optional().trim(),
  ],
  validate,
  resolveRemark,
);

module.exports = router;

