// @ts-nocheck
const studentRoundService = require("../services/studentRoundService");
const { ForbiddenError } = require("../errors/AppError");

const resolveEntrantId = (req) => {
  if (!req.user?.entrant?.id) {
    throw new ForbiddenError("No entrant profile linked to your account");
  }
  return req.user.entrant.id;
};

const listRegisteredRounds = async (req, res, next) => {
  try {
    const entrantId = resolveEntrantId(req);
    const data = await studentRoundService.getRegisteredRounds(entrantId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

const getRoundDetail = async (req, res, next) => {
  try {
    const entrantId = resolveEntrantId(req);
    const data = await studentRoundService.getStudentRoundDetail(
      req.params.roundId,
      entrantId,
    );
    res.json({ success: true, data: { round: data } });
  } catch (err) {
    next(err);
  }
};

const getStudentResults = async (req, res, next) => {
  try {
    const entrantId = resolveEntrantId(req);
    const data = await studentRoundService.getStudentResults(entrantId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

const downloadPaper = async (req, res, next) => {
  try {
    const entrantId = resolveEntrantId(req);
    const url = await studentRoundService.getStudentPaperUrl(
      req.params.roundId,
      entrantId,
    );
    res.json({ success: true, data: { url } });
  } catch (err) {
    next(err);
  }
};

const submitRemark = async (req, res, next) => {
  try {
    const entrantId = resolveEntrantId(req);
    const remark = await studentRoundService.submitRemarkRequest(
      entrantId,
      req.params.roundId,
      req.body.reason,
    );
    res.status(201).json({ success: true, data: { remark } });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  listRegisteredRounds,
  getRoundDetail,
  getStudentResults,
  downloadPaper,
  submitRemark,
};

