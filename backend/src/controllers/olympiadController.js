// @ts-nocheck
const olympiadService = require("../services/olympiadService");

const createOlympiad = async (req, res, next) => {
  try {
    const { name, timezone } = req.body;
    const olympiad = await olympiadService.createOlympiad({
      name,
      timezone,
      organiserId: req.user.userId,
    });
    res.status(201).json({ success: true, data: { olympiad } });
  } catch (err) {
    next(err);
  }
};

const listOlympiads = async (req, res, next) => {
  try {
    const olympiads = await olympiadService.listOlympiads(req.user.userId);
    res.json({ success: true, data: { olympiads } });
  } catch (err) {
    next(err);
  }
};

const getOlympiad = async (req, res, next) => {
  try {
    const olympiad = await olympiadService.getOlympiad(
      req.params.id,
      req.user.userId,
    );
    res.json({ success: true, data: { olympiad } });
  } catch (err) {
    next(err);
  }
};

module.exports = { createOlympiad, listOlympiads, getOlympiad };
