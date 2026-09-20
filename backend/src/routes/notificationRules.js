const express = require("express");
const { body } = require("express-validator");
const { requireAuth, requireRole } = require("../middlewares/auth");
const validate = require("../middlewares/validate");
const controller = require("../controllers/notificationRuleController");

const router = express.Router({ mergeParams: true });
const ruleFields = [
  body("name").optional().isString().withMessage("name must be text"),
  body("trigger")
    .optional()
    .isIn(["round_opens", "round_closes", "results_released"])
    .withMessage("trigger must be one of: round_opens, round_closes, results_released"),
  body("offset_minutes")
    .optional()
    .isInt({ min: 0 })
    .withMessage("offset_minutes must be a non-negative integer"),
  body("recipient")
    .optional()
    .isIn(["registered_educators", "registered_schools", "qualifying_entrants"])
    .withMessage("recipient must be one of: registered_educators, registered_schools, qualifying_entrants"),
  body("condition").optional({ values: "null" }).isString().withMessage("condition must be text"),
  body("enabled").optional().isBoolean().withMessage("enabled must be true or false"),
];

router.use(requireAuth, requireRole("organiser"));
router.get("/", controller.listRules);
router.post("/", ruleFields, validate, controller.createRule);
router.patch("/:ruleId", ruleFields, validate, controller.updateRule);
router.post("/:ruleId/test", [body("round_id").isUUID().withMessage("round_id must be a valid UUID")], validate, controller.testRule);
router.delete("/:ruleId", controller.deleteRule);

module.exports = router;