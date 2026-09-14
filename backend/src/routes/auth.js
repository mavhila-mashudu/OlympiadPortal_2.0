// @ts-nocheck
const express = require("express");
const { body } = require("express-validator");
const {
  registerOrganiser,
  registerWithCode,
  validateCode,
  validateInviteToken,
  me,
  deleteAccount,
  inviteSchool,
  inviteEducator,
  generateStudentCodes,
  getEducatorOlympiads,
  inviteStudent,
  getStudentInvitations,
} = require("../controllers/authController");
const { requireAuth, requireRole, requireSchoolMembership } = require("../middlewares/auth");
const validate = require("../middlewares/validate");

const router = express.Router();

const passwordRule = body("password")
  .isLength({ min: 8 })
  .withMessage("Min 8 characters")
  .matches(/[A-Z]/)
  .withMessage("Needs uppercase")
  .matches(/[0-9]/)
  .withMessage("Needs a number");

const organiserRules = [
  body("full_name").trim().notEmpty().withMessage("Full name is required"),
  body("email")
    .trim()
    .isEmail()
    .normalizeEmail()
    .withMessage("Valid email required"),
  passwordRule,
];

const registerRules = [
  body("full_name").trim().notEmpty().withMessage("Full name is required"),
  body("email")
    .trim()
    .isEmail()
    .normalizeEmail()
    .withMessage("Valid email required"),
  passwordRule,
  body().custom((value) => {
    if (!value.code && !value.invite_token) throw new Error("Invitation link or code required");
    return true;
  }),
];

const inviteSchoolRules = [
  body("school_name").trim().notEmpty().withMessage("School name required"),
  body("contact_email").trim().isEmail().withMessage("Valid email required"),
  body("olympiad_id").notEmpty().withMessage("Olympiad ID required"),
];

const inviteEducatorRules = [
  body("email").trim().isEmail().withMessage("Valid email required"),
  body("olympiad_id").notEmpty().withMessage("Olympiad ID required"),
];

const studentCodesRules = [
  body("count").isInt({ min: 1, max: 200 }).withMessage("Count 1-200"),
  body("olympiad_id").notEmpty().withMessage("Olympiad ID required"),
];

const inviteStudentRules = [
  body("email").trim().isEmail().normalizeEmail().withMessage("Valid student email required"),
  body("olympiad_id").notEmpty().withMessage("Olympiad ID required"),
];

router.post("/register/organiser", organiserRules, validate, registerOrganiser);
router.post("/register", registerRules, validate, registerWithCode);
router.get("/validate-code/:code", validateCode);
router.get("/validate-invite/:token", validateInviteToken);

router.get("/me", requireAuth, me);
router.delete("/account", requireAuth, deleteAccount);

router.post(
  "/invite-school",
  requireAuth,
  requireRole("organiser"),
  inviteSchoolRules,
  validate,
  inviteSchool,
);

router.get("/educator-olympiads", requireAuth, requireRole("educator"), requireSchoolMembership("coordinator", "educator"), getEducatorOlympiads);
router.get("/student-invitations", requireAuth, requireRole("educator"), requireSchoolMembership("coordinator", "educator"), getStudentInvitations);
router.post(
  "/invite-student",
  requireAuth,
  requireRole("educator"),
  requireSchoolMembership("coordinator", "educator"),
  inviteStudentRules,
  validate,
  inviteStudent,
);

router.post(
  "/invite-educator",
  requireAuth,
  requireRole("educator"),
  requireSchoolMembership("coordinator"),
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
