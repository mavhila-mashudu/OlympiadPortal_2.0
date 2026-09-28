// @ts-nocheck
const prisma = require("../config/database").default;
const { assertOwnsOlympiad } = require("./olympiadService");

// -----------------------------------------
// The schools taking part in an olympiad, together with the educators who
// have been invited but have not answered yet. A school only becomes a
// participant once one of its educators accepts an invitation, so a pending
// row is an outstanding invite rather than a half-registered school.
// -----------------------------------------
const SCHOOL_DETAIL = {
  educators: { include: { users: { select: { full_name: true, email: true } } } },
  _count: { select: { entrants: true } },
};

const describeSchool = (school) => ({
  name: school.name,
  address: school.address || null,
  entrants: school._count?.entrants || 0,
  educators: school.educators.map((e) => ({ name: e.users.full_name, email: e.users.email })),
});

const listSchools = async (olympiadId, organiserId) => {
  await assertOwnsOlympiad(olympiadId, organiserId);

  const registrations = await prisma.school_registrations.findMany({
    where: { olympiad_id: olympiadId, status: "approved" },
    include: { schools: { include: SCHOOL_DETAIL } },
  });

  const registeredSchoolIds = new Set(registrations.map((reg) => reg.school_id));

  const pendingInvites = await prisma.olympiad_invites.findMany({
    where: { olympiad_id: olympiadId, role: "educator", status: { in: ["pending", "rejected"] } },
    include: {
      schools: { include: SCHOOL_DETAIL },
      invitee: { select: { full_name: true, email: true } },
    },
    orderBy: { created_at: "desc" },
  });

  const registeredRows = registrations.map((reg) => ({
    id: reg.schools.id,
    ...describeSchool(reg.schools),
    contactEmail: null,
    status: "accepted",
  }));

  // A school that has already accepted through one educator is listed once,
  // as a participant; a second outstanding invite for it adds no new row.
  const inviteRows = pendingInvites
    .filter((invite) => invite.schools && !registeredSchoolIds.has(invite.school_id))
    .map((invite) => ({
      id: invite.id,
      ...describeSchool(invite.schools),
      contactEmail: invite.invitee?.email || null,
      status: invite.status === "rejected" ? "declined" : "pending",
    }));

  return [...registeredRows, ...inviteRows];
};

module.exports = { listSchools };
