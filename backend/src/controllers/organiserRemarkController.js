// @ts-nocheck
const organiserRemarkService = require("../services/organiserRemarkService");

const listRemarks = async (req, res, next) => {
  try {
    const remarks = await organiserRemarkService.listRemarks(req.user.userId, {
      olympiadId: req.query.olympiadId,
      roundId: req.query.roundId,
      status: req.query.status,
    });
    res.json({ success: true, data: { remarks } });
  } catch (err) {
    next(err);
  }
};

const listEligibleEducators = async (req, res, next) => {
  try {
    const educators = await organiserRemarkService.listEligibleEducators(
      req.user.userId,
      req.params.roundId,
    );
    res.json({ success: true, data: { educators } });
  } catch (err) {
    next(err);
  }
};

const assignRemark = async (req, res, next) => {
  try {
    const remark = await organiserRemarkService.assignRemark(
      req.user.userId,
      req.params.remarkId,
      req.body.reviewerId,
    );
    res.json({ success: true, data: { remark } });
  } catch (err) {
    next(err);
  }
};

const autoAssignRemarks = async (req, res, next) => {
  try {
    const result = await organiserRemarkService.autoAssignRemarks(
      req.user.userId,
      req.params.roundId,
    );
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  listRemarks,
  listEligibleEducators,
  assignRemark,
  autoAssignRemarks,
};
