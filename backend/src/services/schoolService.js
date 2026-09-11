// @ts-nocheck
const prisma = require("../config/database").default;
const { assertOwnsOlympiad } = require("./olympiadService");

// ─────────────────────────────────────────
// SCHOOL INVITATIONS AND REGISTERED SCHOOLS for an olympiad. Pending
// invitations intentionally have no school or educator record yet.
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

  const invitations = await prisma.invitations.findMany({
    where: { olympiad_id: olympiadId, type: "school" },
    include: {
      schools: {
        include: {
          educators: { include: { users: { select: { full_name: true, email: true } } } },
          _count: { select: { entrants: true } },
        },
      },
    },
    orderBy: { created_at: "desc" },
  });

  const now = new Date();
  const invitedSchoolIds = new Set();
  const invitationRows = invitations.map((invitation) => {
    if (invitation.school_id) invitedSchoolIds.add(invitation.school_id);
    const school = invitation.schools;
    return {
      id: invitation.id,
      name: invitation.school_name || school?.name || "Unnamed school",
      address: school?.address || null,
      entrants: school?._count.entrants || 0,
      educators: school
        ? school.educators.map((e) => ({ name: e.users.full_name, email: e.users.email }))
        : [],
      contactEmail: invitation.email || null,
      status: invitation.used_by_id
        ? "accepted"
        : invitation.expires_at < now
          ? "expired"
          : "pending",
    };
  });

  const registeredWithoutInvitation = registrations
    .filter((reg) => !invitedSchoolIds.has(reg.schools.id))
    .map((reg) => ({
      id: reg.schools.id,
      name: reg.schools.name,
      address: reg.schools.address,
      entrants: reg.schools._count.entrants,
      educators: reg.schools.educators.map((e) => ({ name: e.users.full_name, email: e.users.email })),
      contactEmail: null,
      status: "accepted",
    }));

  return [...invitationRows, ...registeredWithoutInvitation];
};

module.exports = { listSchools };
