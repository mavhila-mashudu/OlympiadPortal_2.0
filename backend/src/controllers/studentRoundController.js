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


module.exports = {
  listRegisteredRounds,
};
