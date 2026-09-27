// @ts-nocheck
const express = require("express");
const { body, param, query } = require("express-validator");
const router = express.Router();
const { requireAuth, requireRole } = require("../middlewares/auth");
const validate = require("../middlewares/validate");
const {
  listRemarks,
  listEligibleEducators,
  assignRemark,
  autoAssignRemarks,
} = require("../controllers/organiserRemarkController");

// All organiser remark routes require authenticated organiser
router.use(requireAuth, requireRole("organiser"));

// GET /organiser/remarks — list all remarks across organiser's rounds
router.get(
  "/",
  [
    query("olympiadId").optional().isUUID().withMessage("olympiadId must be a valid UUID"),
    query("roundId").optional().isUUID().withMessage("roundId must be a valid UUID"),
    query("status").optional().isIn(["all", "unassigned", "assigned", "pending", "reviewed"]).withMessage("Invalid status filter"),
  ],
  validate,
  listRemarks,
);

// GET /organiser/remarks/rounds/:roundId/educators — list participating educators eligible for assignment
router.get(
  "/rounds/:roundId/educators",
  [param("roundId").isUUID().withMessage("roundId must be a valid UUID")],
  validate,
  listEligibleEducators,
);

// PATCH /organiser/remarks/:remarkId/assign — manually assign a remark to an educator
router.patch(
  "/:remarkId/assign",
  [
    param("remarkId").isUUID().withMessage("remarkId must be a valid UUID"),
    body("reviewerId").isUUID().withMessage("reviewerId must be a valid educator user UUID"),
  ],
  validate,
  assignRemark,
);

// POST /organiser/remarks/rounds/:roundId/auto-assign — auto-distribute unassigned remarks evenly
router.post(
  "/rounds/:roundId/auto-assign",
  [param("roundId").isUUID().withMessage("roundId must be a valid UUID")],
  validate,
  autoAssignRemarks,
);

module.exports = router;
