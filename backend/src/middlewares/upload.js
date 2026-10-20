// @ts-nocheck
const multer = require('multer');
const { BadRequestError } = require('../errors/AppError');

// Memory storage — files arrive as buffers we hand straight to Supabase,
// nothing touches local disk on this server.
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 20 * 1024 * 1024, // 20MB per file
        files: 2,
        fields: 2,
        parts: 4,
    },
    fileFilter(_req, file, callback) {
        const hasPdfName = /\.pdf$/i.test(file.originalname || '');
        const hasPdfType =
            file.mimetype === 'application/pdf' ||
            (file.mimetype === 'application/octet-stream' && hasPdfName);
        if (!hasPdfName || !hasPdfType) {
            return callback(new BadRequestError('Only PDF files are accepted'));
        }
        callback(null, true);
    },
});

module.exports = upload;
