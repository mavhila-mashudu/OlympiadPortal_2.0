// @ts-nocheck
const questionService = require("../services/questionService");

const createQuestion = async (req, res, next) => {
  try {
    const {
      type,
      prompt,
      options,
      correct_option,
      correct_answer,
      negative_pct,
      max_points,
    } = req.body;

    const question = await questionService.createQuestion(
      req.params.roundId,
      req.user.userId,
      req.user.role,
      {
        type,
        prompt,
        options,
        correct_option,
        correct_answer,
        negative_pct,
        max_points,
      },
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
      req.user.role,
    );

    res.json({ success: true, data: { questions } });
  } catch (err) {
    next(err);
  }
};

const updateQuestion = async (req, res, next) => {
  try {
    const {
      type,
      prompt,
      options,
      correct_option,
      correct_answer,
      negative_pct,
      max_points,
    } = req.body;

    const question = await questionService.updateQuestion(
      req.params.id,
      req.user.userId,
      req.user.role,
      {
        type,
        prompt,
        options,
        correct_option,
        correct_answer,
        negative_pct,
        max_points,
      },
      req.params.roundId,
    );

    res.json({ success: true, data: { question } });
  } catch (err) {
    next(err);
  }
};

const deleteQuestion = async (req, res, next) => {
  try {
    await questionService.deleteQuestion(
      req.params.id,
      req.user.userId,
      req.user.role,
      req.params.roundId,
    );
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
