// @ts-nocheck
const { createClient } = require("@supabase/supabase-js");
const prisma = require("../config/database").default;
const { UnauthorizedError, ForbiddenError } = require("../errors/AppError");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
);

const requireAuth = async (req, _res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new UnauthorizedError("No token provided");
    }

    const token = authHeader.split(" ")[1];

    // Verify token with Supabase — no manual JWT verification needed
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error || !user) {
      throw new UnauthorizedError("Invalid or expired token");
    }

    // Get role and profile from YOUR database
    const dbUser = await prisma.users.findUnique({
      where: { id: user.id },
      include: {
        educators: { select: { id: true, school_id: true } },
        entrants: { select: { id: true, school_id: true } },
      },
    });

    if (!dbUser || dbUser.deleted_at) {
      throw new UnauthorizedError("Account not found or deleted");
    }

    // Attach user to request
    req.user = {
      userId: dbUser.id,
      email: dbUser.email,
      role: dbUser.role,
      schoolId:
        dbUser.educators?.school_id || dbUser.entrants?.school_id || null,
      educator: dbUser.educators || null,
    };

    next();
  } catch (err) {
    next(err);
  }
};

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

const requireSameSchool = async (req, _res, next) => {
  try {
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
