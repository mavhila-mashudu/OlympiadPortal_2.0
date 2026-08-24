// @ts-nocheck
const jwt = require("jsonwebtoken");
const config = require("../config/env");
const { UnauthorizedError, ForbiddenError } = require("../errors/AppError");

/**
 * Protects routes — user must be logged in
 * Reads Bearer token from Authorization header
 * Attaches decoded user to req.user
 */
const requireAuth = (req, _res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new UnauthorizedError("No token provided");
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, config.auth.jwtSecret);

    req.user = {
      userId: decoded.userId,
      email: decoded.email,
      role: decoded.role,
      schoolId: decoded.schoolId || null,
    };

    next();
  } catch (err) {
    next(err);
  }
};

/**
 * Restricts routes to specific roles
 * Always use AFTER requireAuth
 *
 * Usage:
 *   requireRole("organiser")
 *   requireRole("organiser", "educator")
 */
const requireRole =
  (...roles) =>
  (req, _res, next) => {
    if (!req.user) {
      return next(new UnauthorizedError("Not authenticated"));
    }

    if (!roles.includes(req.user.role)) {
      return next(new ForbiddenError("Insufficient permissions"));
    }

    next();
  };

/**
 * Ensures an educator can only manage their own school
 * Use AFTER requireAuth + requireRole("educator")
 *
 * Expects schoolId in req.params
 */
const requireSameSchool = async (req, _res, next) => {
  try {
    const prisma = require("../config/database").default;
    const educator = await prisma.educators.findUnique({
      where: { user_id: req.user.userId },
    });

    if (!educator || educator.school_id !== req.params.schoolId) {
      return next(new ForbiddenError("Not your school"));
    }

    req.educator = educator;
    next();
  } catch (err) {
    next(err);
  }
};

module.exports = { requireAuth, requireRole, requireSameSchool };
