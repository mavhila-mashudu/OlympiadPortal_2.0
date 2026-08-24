// @ts-nocheck
const multer = require("multer");

// Memory storage — files arrive as buffers we hand straight to Supabase,
// nothing touches local disk on this server.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB per file
});

module.exports = upload;