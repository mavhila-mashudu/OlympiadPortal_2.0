// @ts-nocheck
const express = require("express");
const { body, param, query } = require("express-validator");
const {
  listMyInvites,
  listSentInvites,
  listCandidates,
  createInvite,
  acceptInvite,
  rejectInvite,
  cancelInvite,
} = require("../controllers/inviteController");
const { requireAuth, requireRole } = require("../middlewares/auth");
const validate = require("../middlewares/validate");

const router = express.Router();

router.use(requireAuth);

const inviteIdRule = [param("inviteId").isUUID().withMessage("Valid invitation id required")];
const olympiadQueryRule = [
  query("olympiad_id").isUUID().withMessage("Valid olympiad id required"),
];
const createInviteRules = [
  body("olympiad_id").isUUID().withMessage("Valid olympiad id required"),
  body("invitee_id").isUUID().withMessage("Select someone to invite"),
  body("message").optional({ values: "falsy" }).isLength({ max: 500 }).withMessage("Message is too long"),
];

// Invitations addressed to the signed-in user, shown on their dashboard.
router.get("/mine", listMyInvites);
router.post("/:inviteId/accept", inviteIdRule, validate, acceptInvite);
router.post("/:inviteId/reject", inviteIdRule, validate, rejectInvite);

// Invitations the signed-in user has sent. Organisers invite educators to
// their own olympiads; educators invite the students of their own school.
router.get(
  "/sent",
  requireRole("organiser", "educator"),
  listSentInvites,
);
router.get(
  "/candidates",
  requireRole("organiser", "educator"),
  olympiadQueryRule,
  validate,
  listCandidates,
);
router.post(
  "/",
  requireRole("organiser", "educator"),
  createInviteRules,
  validate,
  createInvite,
);
router.delete("/:inviteId", requireRole("organiser", "educator"), inviteIdRule, validate, cancelInvite);

module.exports = router;
