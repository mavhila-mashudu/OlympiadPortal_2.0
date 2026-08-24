// @ts-nocheck
const express = require("express");
const { body } = require("express-validator");
const router = express.Router();
const {
  registerOrganiser,
  registerWithCode,
  validateCode,
  me,
  deleteAccount,
  inviteSchool,
  inviteEducator,
  generateStudentCodes,
} = require("../controllers/authController");
const { requireAuth, requireRole } = require("../middlewares/auth");
const validate = require("../middlewares/validate");

const organiserRules = [
  body("full_name").trim().notEmpty().withMessage("Full name is required"),
  body("email")
    .trim()
    .isEmail()
    .normalizeEmail()
    .withMessage("Valid email required"),
  body("password")
    .isLength({ min: 8 })
    .withMessage("Min 8 characters")
    .matches(/[A-Z]/)
    .withMessage("Needs uppercase")
    .matches(/[0-9]/)
    .withMessage("Needs a number"),
  body("organiser_secret").notEmpty().withMessage("Secret required"),
];

const registerRules = [
  body("full_name").trim().notEmpty().withMessage("Full name is required"),
  body("email")
    .trim()
    .isEmail()
    .normalizeEmail()
    .withMessage("Valid email required"),
  body("password")
    .isLength({ min: 8 })
    .withMessage("Min 8 characters")
    .matches(/[A-Z]/)
    .withMessage("Needs uppercase")
    .matches(/[0-9]/)
    .withMessage("Needs a number"),
  body("code").trim().notEmpty().withMessage("Invitation code required"),
];

// Public
router.post("/register/organiser", organiserRules, validate, registerOrganiser);
router.post("/register", registerRules, validate, registerWithCode);
router.get("/validate-code/:code", validateCode);

// Protected
router.get("/me", requireAuth, me);
router.delete("/account", requireAuth, deleteAccount);

// Organiser only
router.post(
  "/invite-school",
  requireAuth,
  requireRole("organiser"),
  [
    body("school_name").trim().notEmpty().withMessage("School name required"),
    body("contact_email").trim().isEmail().withMessage("Valid email required"),
    body("olympiad_id").notEmpty().withMessage("Olympiad ID required"),
  ],
  validate,
  inviteSchool,
);

// Educator only
router.post(
  "/invite-educator",
  requireAuth,
  requireRole("educator"),
  [
    body("email").trim().isEmail().withMessage("Valid email required"),
    body("olympiad_id").notEmpty().withMessage("Olympiad ID required"),
  ],
  validate,
  inviteEducator,
);

router.post(
  "/generate-student-codes",
  requireAuth,
  requireRole("educator"),
  [
    body("count").isInt({ min: 1, max: 200 }).withMessage("Count 1-200"),
    body("olympiad_id").notEmpty().withMessage("Olympiad ID required"),
  ],
  validate,
  generateStudentCodes,
);

module.exports = router;
