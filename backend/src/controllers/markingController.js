// @ts-nocheck
const markingService = require("../services/markingService");

const markRound = async (req, res, next) => {
  try {
    const result = await markingService.autoMarkRound(
      req.params.roundId,
      req.user.userId,
      req.user.role,
    );

    res.json({ success: true, data: { result } });
  } catch (err) {
    next(err);
  }
};

const markAnswer = async (req, res, next) => {
  try {
    const { is_correct, points_awarded } = req.body;

    const result = await markingService.markAnswer(
      req.params.id,
      req.user.userId,
      { is_correct, points_awarded },
    );

    res.json({ success: true, data: { result } });
  } catch (err) {
    next(err);
  }
};

const generateResults = async (req, res, next) => {
  try {
    const result = await markingService.generateResults(
      req.params.roundId,
      req.user.userId,
      req.user.role,
    );

    res.json({ success: true, data: { result } });
  } catch (err) {
    next(err);
  }
};

module.exports = { markRound, markAnswer, generateResults };
