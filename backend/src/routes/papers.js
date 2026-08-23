// @ts-nocheck
const express = require("express");
const router = express.Router();
const { downloadPaper } = require("../controllers/paperController");
const { requireAuth, requireRole } = require("../middlewares/auth");

router.use(requireAuth, requireRole("organiser"));
router.get("/:id/download", downloadPaper);

module.exports = router;