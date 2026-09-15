const notificationRuleService = require("../services/notificationRuleService");

const listRules = async (req, res, next) => {
  try {
    const rules = await notificationRuleService.listRules(req.params.olympiadId, req.user.userId);
    res.json({ success: true, data: { rules } });
  } catch (err) { next(err); }
};

const createRule = async (req, res, next) => {
  try {
    const rule = await notificationRuleService.createRule({
      olympiadId: req.params.olympiadId,
      organiserId: req.user.userId,
      data: req.body,
    });
    res.status(201).json({ success: true, data: { rule } });
  } catch (err) { next(err); }
};

const updateRule = async (req, res, next) => {
  try {
    const rule = await notificationRuleService.updateRule({
      ruleId: req.params.ruleId,
      organiserId: req.user.userId,
      data: req.body,
    });
    res.json({ success: true, data: { rule } });
  } catch (err) { next(err); }
};

const deleteRule = async (req, res, next) => {
  try {
    await notificationRuleService.deleteRule(req.params.ruleId, req.user.userId);
    res.json({ success: true, data: { message: "Notification rule deleted" } });
  } catch (err) { next(err); }
};

module.exports = { listRules, createRule, updateRule, deleteRule };
const testRule = async (req, res, next) => {
  try {
    const result = await notificationRuleService.testRule({
      ruleId: req.params.ruleId,
      organiserId: req.user.userId,
      roundId: req.body.round_id,
    });
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

module.exports = { listRules, createRule, updateRule, deleteRule, testRule };