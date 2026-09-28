// @ts-nocheck
const educatorService = require("../services/educatorService");

// ─────────────────────────────────────────
// ROUNDS
// ─────────────────────────────────────────

const listRounds = async (req, res, next) => {
  try {
    const { rounds, school } = await educatorService.listEducatorRounds(
      req.user.userId,
    );
    res.json({ success: true, data: { rounds, school } });
  } catch (err) {
    next(err);
  }
};

const getRound = async (req, res, next) => {
  try {
    const round = await educatorService.getEducatorRoundDetail(
      req.params.roundId,
      req.user.userId,
    );
    res.json({ success: true, data: { round } });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────
// ENTRANTS
// ─────────────────────────────────────────

const registerEntrants = async (req, res, next) => {
  try {
    const { entrants } = req.body;
    const registered = await educatorService.registerEntrants(
      req.params.roundId,
      req.user.userId,
      entrants,
    );
    res.status(201).json({
      success: true,
      data: { entrants: registered },
    });
  } catch (err) {
    next(err);
  }
};

const listEntrants = async (req, res, next) => {
  try {
    const entrants = await educatorService.listEntrants(
      req.params.roundId,
      req.user.userId,
    );
    res.json({ success: true, data: { entrants } });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────
// PROGRESSION INFO
// ─────────────────────────────────────────

const getProgressionInfo = async (req, res, next) => {
  try {
    const info = await educatorService.getProgressionInfo(
      req.params.roundId,
      req.user.userId,
    );
    res.json({ success: true, data: info });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────
// OLYMPIAD-LEVEL ENTRANTS
// ─────────────────────────────────────────

const registerEntrantsForOlympiad = async (req, res, next) => {
  try {
    const { entrants } = req.body;
    const registered = await educatorService.registerEntrantsForOlympiad(
      req.params.olympiadId,
      req.user.userId,
      entrants,
    );
    res.status(201).json({
      success: true,
      data: { entrants: registered },
    });
  } catch (err) {
    next(err);
  }
};

const listOlympiadEntrants = async (req, res, next) => {
  try {
    const entrants = await educatorService.listOlympiadEntrants(
      req.params.olympiadId,
      req.user.userId,
    );
    res.json({ success: true, data: { entrants } });
  } catch (err) {
    next(err);
  }
};

const getOlympiadProgressionInfo = async (req, res, next) => {
  try {
    const info = await educatorService.getOlympiadProgressionInfo(
      req.params.olympiadId,
      req.user.userId,
    );
    res.json({ success: true, data: info });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────
// RESULTS
// ─────────────────────────────────────────

const getResults = async (req, res, next) => {
  try {
    const data = await educatorService.getResults(
      req.params.roundId,
      req.user.userId,
    );
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

const listAllResults = async (req, res, next) => {
  try {
    const rounds = await educatorService.listAllResults(req.user.userId);
    res.json({ success: true, data: { rounds } });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────
// PAPERS
// ─────────────────────────────────────────

const listPastPapers = async (req, res, next) => {
  try {
    const papers = await educatorService.listPastPapers(
      req.params.roundId,
      req.user.userId,
    );
    res.json({ success: true, data: { papers } });
  } catch (err) {
    next(err);
  }
};

const downloadPaper = async (req, res, next) => {
  try {
    const type = req.query.type === "memo" ? "memo" : "paper";
    const url = await educatorService.getPaperDownloadUrl(
      req.params.roundId,
      req.user.userId,
      type,
    );
    res.json({ success: true, data: { url } });
  } catch (err) {
    next(err);
  }
};

const listRemarks = async (req, res, next) => {
  try {
    const remarks = await educatorService.listRemarks(req.user.userId);
    res.json({ success: true, data: { remarks } });
  } catch (err) {
    next(err);
  }
};

const getRemarkSubmissionAnswers = async (req, res, next) => {
  try {
    const data = await educatorService.getRemarkSubmissionAnswers(
      req.params.remarkId,
      req.user.userId,
    );
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

const updateRemarkAnswer = async (req, res, next) => {
  try {
    const result = await educatorService.updateRemarkAnswer(
      req.params.remarkId,
      req.params.answerId,
      req.user.userId,
      {
        points_awarded: req.body.points_awarded,
        is_correct: req.body.is_correct,
      },
    );
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

const resolveRemark = async (req, res, next) => {
  try {
    const remark = await educatorService.resolveRemark(
      req.params.remarkId,
      req.user.userId,
      {
        status: req.body.status,
        review_note: req.body.review_note,
      },
    );
    res.json({ success: true, data: { remark } });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  listRounds,
  getRound,
  registerEntrants,
  registerEntrantsForOlympiad,
  listEntrants,
  listOlympiadEntrants,
  getProgressionInfo,
  getOlympiadProgressionInfo,
  getResults,
  listAllResults,
  listPastPapers,
  downloadPaper,
  listRemarks,
  getRemarkSubmissionAnswers,
  updateRemarkAnswer,
  resolveRemark,
};


