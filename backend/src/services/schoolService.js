// @ts-nocheck
const prisma = require("../config/database").default;
const { assertOwnsOlympiad } = require("./olympiadService");

// ─────────────────────────────────────────
// SCHOOLS REGISTERED TO AN OLYMPIAD, with educators
// NOTE: entrant count is per-school, not scoped to this
// olympiad specifically — see caveat above.
// ─────────────────────────────────────────
const listSchools = async (olympiadId, organiserId) => {
  await assertOwnsOlympiad(olympiadId, organiserId);

  const registrations = await prisma.school_registrations.findMany({
    where: { olympiad_id: olympiadId },
    include: {
      schools: {
        include: {
          educators: { include: { users: { select: { full_name: true, email: true } } } },
          _count: { select: { entrants: true } },
        },
      },
    },
  });

  return registrations.map((reg) => ({
    id: reg.schools.id,
    name: reg.schools.name,
    address: reg.schools.address,
    entrants: reg.schools._count.entrants,
    educators: reg.schools.educators.map((e) => ({
      name: e.users.full_name,
      email: e.users.email,
    })),
  }));
};

module.exports = { listSchools };