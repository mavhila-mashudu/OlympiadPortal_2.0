// @ts-nocheck
const inviteService = require("../services/inviteService");

const listMyInvites = async (req, res, next) => {
  try {
    const invites = await inviteService.listMyInvites(req.user.userId);
    res.json({ success: true, data: { invites } });
  } catch (err) {
    next(err);
  }
};

const listSentInvites = async (req, res, next) => {
  try {
    const invites =
      req.user.role === "organiser"
        ? await inviteService.listOlympiadInvites(req.query.olympiad_id, req.user.userId)
        : await inviteService.listSchoolStudentInvites(req.user.userId);
    res.json({ success: true, data: { invites } });
  } catch (err) {
    next(err);
  }
};

const listCandidates = async (req, res, next) => {
  try {
    const candidates = await inviteService.listInviteCandidates({
      olympiadId: req.query.olympiad_id,
      userId: req.user.userId,
      role: req.user.role,
    });
    res.json({ success: true, data: { candidates } });
  } catch (err) {
    next(err);
  }
};

const createInvite = async (req, res, next) => {
  try {
    const invite = await inviteService.createInvite({
      olympiadId: req.body.olympiad_id,
      inviteeId: req.body.invitee_id,
      message: req.body.message,
      inviterId: req.user.userId,
      inviterRole: req.user.role,
    });
    res.status(201).json({ success: true, data: { invite } });
  } catch (err) {
    next(err);
  }
};

const acceptInvite = async (req, res, next) => {
  try {
    const invite = await inviteService.respondToInvite({
      inviteId: req.params.inviteId,
      userId: req.user.userId,
      accept: true,
    });
    res.json({ success: true, data: { invite } });
  } catch (err) {
    next(err);
  }
};

const rejectInvite = async (req, res, next) => {
  try {
    const invite = await inviteService.respondToInvite({
      inviteId: req.params.inviteId,
      userId: req.user.userId,
      accept: false,
    });
    res.json({ success: true, data: { invite } });
  } catch (err) {
    next(err);
  }
};

const cancelInvite = async (req, res, next) => {
  try {
    const result = await inviteService.cancelInvite({
      inviteId: req.params.inviteId,
      userId: req.user.userId,
    });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  listMyInvites,
  listSentInvites,
  listCandidates,
  createInvite,
  acceptInvite,
  rejectInvite,
  cancelInvite,
};
