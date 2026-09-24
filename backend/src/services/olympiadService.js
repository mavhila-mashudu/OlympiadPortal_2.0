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

  const { defaultRules } = require("./notificationDeliveryService");
  await prisma.notification_rules.createMany({
    data: defaultRules.map((rule) => ({ ...rule, olympiad_id: olympiad.id, channel: "in_app" })),
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

// ========================================
// UPDATE OLYMPIAD
// Only the owning organiser can rename it
// ========================================
const updateOlympiad = async (olympiadId, organiserId, { name }) => {
  await assertOwnsOlympiad(olympiadId, organiserId);

  const data = {};
  if (name !== undefined) data.name = name;

  if (Object.keys(data).length === 0) {
    throw new BadRequestError("No fields to update");
  }

  const olympiad = await prisma.olympiads.update({
    where: { id: olympiadId },
    data,
  });

  return olympiad;
};

// ========================================
// DELETE OLYMPIAD
// Only allowed when the olympiad has no rounds —
// deleting one with rounds would orphan submissions
// ========================================
const deleteOlympiad = async (olympiadId, organiserId) => {
  const olympiad = await getOlympiad(olympiadId, organiserId);

  if (olympiad.rounds.length > 0) {
    throw new BadRequestError(
      "Cannot delete an olympiad that has rounds — delete the rounds first",
    );
  }

  await prisma.olympiads.delete({ where: { id: olympiadId } });
};

module.exports = {
  createOlympiad,
  listOlympiads,
  getOlympiad,
  updateOlympiad,
  deleteOlympiad,
  assertOwnsOlympiad,
};
