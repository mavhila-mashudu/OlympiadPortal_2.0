// @ts-nocheck
const schoolService = require("../services/schoolService");
const paperService = require("../services/paperService");

const listSchools = async (req, res, next) => {
  try {
    const schools = await schoolService.listSchools(req.params.olympiadId, req.user.userId);
    res.json({ success: true, data: { schools } });
  } catch (err) {
    next(err);
  }
};

const listArchive = async (req, res, next) => {
  try {
    const rounds = await paperService.listArchive(req.params.olympiadId, req.user.userId);
    res.json({ success: true, data: { rounds } });
  } catch (err) {
    next(err);
  }
};

module.exports = { listSchools, listArchive };