// @ts-nocheck
const express = require("express");
const { body } = require("express-validator");
const router = express.Router();
const {
  registerOrganiser,
  validateCode,
  registerWithCode,
  login,
  devLogin,
  refresh,
  logout,
  me,
  forgotPassword,
  resetPassword,
  deleteAccount,
  inviteSchool,
  inviteEducator,
  generateStudentCodes,
} = require("../controllers/authController");
const { requireAuth, requireRole } = require("../middlewares/auth");
const validate = require("../middlewares/validate");

// ── Validation rules ────────────────────────────────────

const organiserRules = [
  body("full_name").trim().notEmpty().withMessage("Full name is required"),
  body("email")
    .trim()
    .isEmail()
    .withMessage("Valid email required")
    .normalizeEmail(),
  body("password")
    .isLength({ min: 8 })
    .withMessage("Password min 8 characters")
    .matches(/[A-Z]/)
    .withMessage("Password needs an uppercase letter")
    .matches(/[0-9]/)
    .withMessage("Password needs a number"),
  body("organiser_secret").notEmpty().withMessage("Organiser secret required"),
];

const registerRules = [
  body("full_name").trim().notEmpty().withMessage("Full name is required"),
  body("email")
    .trim()
    .isEmail()
    .withMessage("Valid email required")
    .normalizeEmail(),
  body("password")
    .isLength({ min: 8 })
    .withMessage("Password min 8 characters")
    .matches(/[A-Z]/)
    .withMessage("Password needs an uppercase letter")
    .matches(/[0-9]/)
    .withMessage("Password needs a number"),
  body("code").trim().notEmpty().withMessage("Invitation code is required"),
];

const loginRules = [
  body("email")
    .trim()
    .isEmail()
    .withMessage("Valid email required")
    .normalizeEmail(),
  body("password").notEmpty().withMessage("Password is required"),
];

// TEMPORARY — validation for the password-free dev login
const devLoginRules = [
  body("email")
    .trim()
    .isEmail()
    .withMessage("Valid email required")
    .normalizeEmail(),
];

const forgotRules = [
  body("email")
    .trim()
    .isEmail()
    .withMessage("Valid email required")
    .normalizeEmail(),
];

const resetRules = [
  body("token").notEmpty().withMessage("Reset token is required"),
  body("newPassword")
    .isLength({ min: 8 })
    .withMessage("Password min 8 characters"),
];

const inviteSchoolRules = [
  body("school_name").trim().notEmpty().withMessage("School name is required"),
  body("contact_email").trim().isEmail().withMessage("Valid email required"),
  body("olympiad_id").notEmpty().withMessage("Olympiad ID is required"),
];

const inviteEducatorRules = [
  body("email").trim().isEmail().withMessage("Valid email required"),
  body("olympiad_id").notEmpty().withMessage("Olympiad ID is required"),
];

const studentCodesRules = [
  body("count")
    .isInt({ min: 1, max: 200 })
    .withMessage("Count must be between 1 and 200"),
  body("olympiad_id").notEmpty().withMessage("Olympiad ID is required"),
];

// ── Routes ──────────────────────────────────────────────

// Public
router.post("/register/organiser", organiserRules, validate, registerOrganiser);
router.post("/register", registerRules, validate, registerWithCode);
router.post("/login", loginRules, validate, login);

// TEMPORARY — bypasses password auth entirely, matches the
// current live `users` table (no password_hash column).
// Remove once real auth is settled with the team.
router.post("/dev-login", devLoginRules, validate, devLogin);

router.post("/refresh", refresh);
router.post("/logout", logout);
router.post("/forgot-password", forgotRules, validate, forgotPassword);
router.post("/reset-password", resetRules, validate, resetPassword);
router.get("/validate-code/:code", validateCode);

// Protected
router.get("/me", requireAuth, me);
router.delete("/account", requireAuth, deleteAccount);

// Organiser only
router.post(
  "/invite-school",
  requireAuth,
  requireRole("organiser"),
  inviteSchoolRules,
  validate,
  inviteSchool,
);

// Educator only
router.post(
  "/invite-educator",
  requireAuth,
  requireRole("educator"),
  inviteEducatorRules,
  validate,
  inviteEducator,
);

router.post(
  "/generate-student-codes",
  requireAuth,
  requireRole("educator"),
  studentCodesRules,
  validate,
  generateStudentCodes,
);

module.exports = router;