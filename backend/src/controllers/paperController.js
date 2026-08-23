// @ts-nocheck
const paperService = require("../services/paperService");

const uploadPapers = async (req, res, next) => {
  try {
    const paperFile = req.files?.paper?.[0];
    const memoFile = req.files?.memo?.[0];

    const paper = await paperService.uploadRoundPapers({
      roundId: req.params.id,
      organiserId: req.user.userId,
      paperFile,
      memoFile,
    });

    res.status(201).json({ success: true, data: { paper } });
  } catch (err) {
    next(err);
  }
};

const downloadPaper = async (req, res, next) => {
  try {
    const type = req.query.type === "memo" ? "memo" : "paper";
    const url = await paperService.getDownloadUrl(req.params.id, req.user.userId, type);
    res.json({ success: true, data: { url } });
  } catch (err) {
    next(err);
  }
};

module.exports = { uploadPapers, downloadPaper };