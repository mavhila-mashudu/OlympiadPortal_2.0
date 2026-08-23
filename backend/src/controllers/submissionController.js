// @ts-nocheck
const submissionService = require("../services/submissionService");

const createSubmission = async (req, res, next) => {
  try {
    const { entrant_id, route, answers } = req.body;

    const result = await submissionService.createSubmission(
      req.params.roundId,
      req.user.userId,
      { entrant_id, route, answers },
    );

    res.status(201).json({
      success: true,
      data: {
        submission: result.submission,
        answers: result.answers,
        totalPoints: result.totalPoints,
        autoMarked: result.allAutoMarked,
      },
    });
  } catch (err) {
    next(err);
  }
};

const listSubmissions = async (req, res, next) => {
  try {
    const submissions = await submissionService.listSubmissions(
      req.params.roundId,
      req.user.userId,
      req.user.role,
    );

    res.json({ success: true, data: { submissions } });
  } catch (err) {
    next(err);
  }
};

const getSubmission = async (req, res, next) => {
  try {
    const submission = await submissionService.getSubmission(
      req.params.id,
      req.user.userId,
      req.user.role,
    );

    res.json({ success: true, data: { submission } });
  } catch (err) {
    next(err);
  }
};

module.exports = { createSubmission, listSubmissions, getSubmission };
