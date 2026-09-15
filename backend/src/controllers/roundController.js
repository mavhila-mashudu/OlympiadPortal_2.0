// @ts-nocheck
const roundService = require("../services/roundService");
const { checkDatesForHolidays } = require("../services/holidayService");

const createRound = async (req, res, next) => {
  try {
    const { name, notes, opens_at, closes_at, qualifying_threshold } = req.body;
    const { round, warnings } = await roundService.createRound({
      olympiadId: req.params.olympiadId,
      organiserId: req.user.userId,
      name,
      notes,
      opensAt: opens_at,
      closesAt: closes_at,
      qualifyingThreshold: qualifying_threshold,
    });
    const data = { round };
    if (warnings.length > 0) data.warnings = warnings;
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

const listRounds = async (req, res, next) => {
  try {
    const rounds = await roundService.listRounds(
      req.params.olympiadId,
      req.user.userId,
    );
    res.json({ success: true, data: { rounds } });
  } catch (err) {
    next(err);
  }
};

const getRound = async (req, res, next) => {
  try {
    const round = await roundService.getRound(req.params.id, req.user.userId);
    res.json({ success: true, data: { round } });
  } catch (err) {
    next(err);
  }
};

const updateRound = async (req, res, next) => {
  try {
    const { name, opens_at, closes_at, qualifying_threshold, notes } = req.body;
    const { round, warnings } = await roundService.updateRound(
      req.params.id,
      req.user.userId,
      {
        name,
        opensAt: opens_at,
        closesAt: closes_at,
        qualifyingThreshold: qualifying_threshold,
        notes,
      },
    );
    const data = { round };
    if (warnings.length > 0) data.warnings = warnings;
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

const deleteRound = async (req, res, next) => {
  try {
    await roundService.deleteRound(req.params.id, req.user.userId);
    res.json({ success: true, data: { message: "Round deleted" } });
  } catch (err) {
    next(err);
  }
};

const setRoundState = async (req, res, next) => {
  try {
    const round = await roundService.setRoundState(
      req.params.id,
      req.user.userId,
      req.body.state,
    );
    res.json({ success: true, data: { round } });
  } catch (err) {
    next(err);
  }
};

const checkDates = async (req, res, next) => {
  try {
    const { opens_at, closes_at } = req.body;
    const dates = [opens_at, closes_at].filter(Boolean).map((d) => new Date(d));
    const warnings = await checkDatesForHolidays(dates);
    res.json({ success: true, data: { warnings } });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  createRound,
  listRounds,
  getRound,
  updateRound,
  deleteRound,
  setRoundState,
  checkDates,
};
