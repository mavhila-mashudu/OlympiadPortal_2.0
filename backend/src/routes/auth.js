// @ts-nocheck
const express = require("express");
const { body } = require("express-validator");
const {
  register,
  registerOrganiser,
  listSchools,
  me,
  logout,
  deleteAccount,
  forgotPassword,
  getEducatorOlympiads,
} = require("../controllers/authController");
const { requireAuth, requireRole, requireSchoolMembership } = require("../middlewares/auth");
const validate = require("../middlewares/validate");
const { createRateLimiter } = require("../middlewares/rateLimit");

// Shared by every public endpoint that creates an account, reads the school
// list that the signup form offers, or sends a password reset email
const publicAuthLimiter = createRateLimiter();

const router = express.Router();

const passwordRule = body("password")
  .isLength({ min: 8 })
  .withMessage("Min 8 characters")
  .matches(/[A-Z]/)
  .withMessage("Needs uppercase")
  .matches(/[0-9]/)
  .withMessage("Needs a number");

const accountRules = [
  body("full_name").trim().notEmpty().withMessage("Full name is required"),
  body("email")
    .trim()
    .isEmail()
    .withMessage("Valid email required")
    .toLowerCase(),
  passwordRule,
];

// Anyone may sign up in any role. Educators and students say which school
// they belong to; a student must pick one that already exists, while an
// educator may name a new school and bring it onto the platform.
const registerRules = [
  ...accountRules,
  body("role")
    .isIn(["organiser", "educator", "student"])
    .withMessage("Choose organiser, educator or student"),
  body("school_id").optional({ values: "falsy" }).isUUID().withMessage("Select a valid school"),
  body("school_name").optional({ values: "falsy" }).trim().isLength({ max: 200 }),
  body().custom((value) => {
    if (value.role === "student" && !value.school_id) {
      throw new Error("Select your school from the list");
    }
    if (value.role === "educator" && !value.school_id && !(value.school_name || "").trim()) {
      throw new Error("Select your school, or enter its name");
    }
    return true;
  }),
];

router.post("/register", publicAuthLimiter, registerRules, validate, register);
// Kept so existing organiser sign-up links and clients keep working
router.post("/register/organiser", publicAuthLimiter, accountRules, validate, registerOrganiser);
router.get("/schools", publicAuthLimiter, listSchools);
router.post(
  "/forgot-password",
  publicAuthLimiter,
  body("email").trim().isEmail().withMessage("Valid email required").toLowerCase(),
  validate,
  forgotPassword,
);

router.get("/me", requireAuth, me);
router.post("/logout", requireAuth, logout);
router.delete("/account", requireAuth, deleteAccount);

router.get(
  "/educator-olympiads",
  requireAuth,
  requireRole("educator"),
  requireSchoolMembership("coordinator", "educator"),
  getEducatorOlympiads,
);

module.exports = router;
