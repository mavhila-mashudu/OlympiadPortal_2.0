// @ts-nocheck
const { AppError } = require("../errors/AppError");

const errorHandler = (err, req, res, next) => {
  // eslint-disable-line no-unused-vars
  console.error({
    message: err.message,
    stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
    url: req.url,
    method: req.method,
  });

  // Our custom operational errors
  if (err.isOperational) {
    return res.status(err.statusCode).json({
      success: false,
      error: err.message,
    });
  }

  // A value that isn't a valid UUID (e.g. /olympiads/abc) reaches Postgres as
  // "invalid input syntax for type uuid" — the client sent a bad id
  if (
    err.code === "P2007" &&
    err.meta?.driverAdapterError?.cause?.originalCode === "22P02"
  ) {
    return res.status(400).json({
      success: false,
      error: "Invalid ID format",
    });
  }

  // Body parser: malformed JSON, or a body over the size limit
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({
      success: false,
      error: "Malformed JSON in request body",
    });
  }
  if (err.type === "entity.too.large") {
    return res.status(413).json({
      success: false,
      error: "Request body is too large",
    });
  }

  // File uploads (multer)
  if (err.name === "MulterError") {
    return res.status(err.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({
      success: false,
      error:
        err.code === "LIMIT_FILE_SIZE"
          ? "File is too large (maximum 20MB)"
          : `Upload rejected: ${err.message}`,
    });
  }

  // Prisma unique constraint violation
  if (err.code === "P2002") {
    return res.status(409).json({
      success: false,
      error: "A record with that value already exists",
    });
  }

  // Foreign key violation: e.g. deleting a question that already has answers
  // (P2003), or a row other records still reference with ON DELETE RESTRICT
  // (P2039 with Prisma driver adapters)
  if (err.code === "P2003" || err.code === "P2039") {
    return res.status(409).json({
      success: false,
      error: "This record is still referenced by other records",
    });
  }

  // Prisma record not found
  if (err.code === "P2025") {
    return res.status(404).json({
      success: false,
      error: "Record not found",
    });
  }

  // JWT errors
  if (err.name === "JsonWebTokenError") {
    return res.status(401).json({
      success: false,
      error: "Invalid token",
    });
  }

  if (err.name === "TokenExpiredError") {
    return res.status(401).json({
      success: false,
      error: "Token expired",
    });
  }

  // Unknown errors
  res.status(500).json({
    success: false,
    error:
      process.env.NODE_ENV === "production"
        ? "Something went wrong"
        : err.message,
  });
};

module.exports = errorHandler;
