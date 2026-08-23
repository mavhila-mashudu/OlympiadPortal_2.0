// @ts-nocheck
const express = require("express");
const { body } = require("express-validator");
const router = express.Router();
const { listSchools, listArchive } = require("../controllers/schoolController");
const {
  createOlympiad,
  listOlympiads,
  getOlympiad,
} = require("../controllers/olympiadController");
const { requireAuth, requireRole } = require("../middlewares/auth");
const validate = require("../middlewares/validate");
const roundsRouter = require("./rounds");

// === Validation rules ====

const createOlympiadRules = [
  body("name").trim().notEmpty().withMessage("Olympiad name is required"),
  body("timezone").optional().trim().notEmpty(),
];

// === Routes ===
// All olympiad routes are organiser-only

router.use(requireAuth, requireRole("organiser"));

router.post("/", createOlympiadRules, validate, createOlympiad);
router.get("/", listOlympiads);
router.get("/:id", getOlympiad);
router.get("/:olympiadId/schools", listSchools);
router.get("/:olympiadId/archive", listArchive);

// Rounds are nested under their olympiad:
// /olympiads/:olympiadId/rounds
router.use("/:olympiadId/rounds", roundsRouter);

module.exports = router;