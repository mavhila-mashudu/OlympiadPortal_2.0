// @ts-nocheck
const prisma = require("../config/database").default;
const {
  NotFoundError,
  ForbiddenError,
  BadRequestError,
} = require("../errors/AppError");


// CREATE OLYMPIAD

const createOlympiad = async ({ name, timezone, organiserId }) => {
  const olympiad = await prisma.olympiads.create({
    data: {
      name,
      organiser_id: organiserId,
      ...(timezone && { timezone }),
    },
  });

  return olympiad;
};


// LIST OLYMPIADS FOR AN ORGANISER

const listOlympiads = async (organiserId) => {
  const olympiads = await prisma.olympiads.findMany({
    where: { organiser_id: organiserId },
    orderBy: { created_at: "desc" },
    include: {
      _count: {
        select: { rounds: true, school_registrations: true },
      },
    },
  });

  return olympiads;
};

// ========================================
// GET A SINGLE OLYMPIAD (with rounds)
// Only the owning organiser can view it
// ========================================
const getOlympiad = async (olympiadId, organiserId) => {
  const olympiad = await prisma.olympiads.findUnique({
    where: { id: olympiadId },
    include: {
      rounds: { orderBy: { opens_at: "asc" } },
      _count: { select: { school_registrations: true } },
    },
  });

  if (!olympiad) throw new NotFoundError("Olympiad not found");
  if (olympiad.organiser_id !== organiserId) {
    throw new ForbiddenError("Not your olympiad");
  }

  return olympiad;
};

// ====================================================
// ASSERT OWNERSHIP
// Shared helper — used by roundService before it
// lets an organiser touch a round under an olympiad
//=====================================================
const assertOwnsOlympiad = async (olympiadId, organiserId) => {
  const olympiad = await prisma.olympiads.findUnique({
    where: { id: olympiadId },
  });

  if (!olympiad) throw new NotFoundError("Olympiad not found");
  if (olympiad.organiser_id !== organiserId) {
    throw new ForbiddenError("Not your olympiad");
  }

  return olympiad;
};

module.exports = {
  createOlympiad,
  listOlympiads,
  getOlympiad,
  assertOwnsOlympiad,
};
