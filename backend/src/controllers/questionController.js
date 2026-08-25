// @ts-nocheck
const questionService = require("../services/questionService");

const createQuestion = async (req, res, next) => {
  try {
    const { type, prompt, options, correct_option, max_points } = req.body;

    const question = await questionService.createQuestion(
      req.params.roundId,
      req.user.userId,
      { type, prompt, options, correct_option, max_points },
    );

    res.status(201).json({ success: true, data: { question } });
  } catch (err) {
    next(err);
  }
};

const listQuestions = async (req, res, next) => {
  try {
    const questions = await questionService.listQuestions(
      req.params.roundId,
      req.user.userId,
    );

    res.json({ success: true, data: { questions } });
  } catch (err) {
    next(err);
  }
};

const updateQuestion = async (req, res, next) => {
  try {
    const { type, prompt, options, correct_option, max_points } = req.body;

    const question = await questionService.updateQuestion(
      req.params.id,
      req.user.userId,
      { type, prompt, options, correct_option, max_points },
    );

    res.json({ success: true, data: { question } });
  } catch (err) {
    next(err);
  }
};

const deleteQuestion = async (req, res, next) => {
  try {
    await questionService.deleteQuestion(req.params.id, req.user.userId);
    res.json({ success: true, data: { message: "Question deleted" } });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  createQuestion,
  listQuestions,
  updateQuestion,
  deleteQuestion,
};
