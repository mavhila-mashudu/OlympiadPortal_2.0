const { test } = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const originalLoad = Module._load;
const now = new Date("2026-09-24T12:00:00Z");
const deliveries = new Set();
const round = {
  id: "round", olympiad_id: "olympiad", name: "Qualifier",
  opens_at: new Date("2026-09-24T13:00:00Z"),
  closes_at: new Date("2026-09-24T13:00:00Z"),
  results_release_at: null, submissions: [],
};
const prisma = {
  $transaction: async (callback) => callback(prisma),
  round_events: { createMany: async () => ({ count: 1 }) },
  notification_rules: { findMany: async () => [
    { id: "opens", olympiad_id: "olympiad", name: "Opens soon", trigger: "round_opens", offset_minutes: 60, recipient: "registered_educators", condition: null },
    { id: "missing", olympiad_id: "olympiad", name: "Still missing", trigger: "missing_submission", offset_minutes: 60, recipient: "registered_schools", condition: null },
  ] },
  rounds: { findMany: async () => [round] },
  olympiads: { findUnique: async () => ({ organiser_id: "organiser" }) },
  school_registrations: { findMany: async () => [{ school_id: "school" }] },
  school_memberships: { findMany: async ({ where }) => where.school_id.in.length ? [{ user_id: "educator" }] : [] },
  entrant_registrations: { findMany: async () => [{ entrants: { school_id: "school" } }] },
  submissions: { findMany: async () => prisma.submitted ? [{ entrants: { school_id: "school" } }] : [] },
  portal_notifications: { createMany: async ({ data }) => {
    let count = 0;
    for (const item of data) if (!deliveries.has(item.dedupe_key)) { deliveries.add(item.dedupe_key); count++; }
    return { count };
  } },
};
Module._load = function(request, parent, isMain) {
  if (request === "../config/database") return { default: prisma };
  return originalLoad.call(this, request, parent, isMain);
};
const delivery = require("../src/services/notificationDeliveryService");
const certificate = require("../src/services/certificateService");
Module._load = originalLoad;

test("due reminders deliver once and skip schools that submitted", async () => {
  assert.equal(await delivery.deliverDueNotifications(now), 2);
  assert.equal(await delivery.deliverDueNotifications(now), 0);
  prisma.submitted = true;
  assert.deepEqual(await delivery.resolveRecipients({ trigger: "missing_submission", recipient: "registered_schools" }, round), []);
  assert.equal(await delivery.deliverDueNotifications(new Date(now.getTime() + 10 * 60_000)), 0);
});

test("organiser action sends the reminder to the organiser once", async () => {
  const original = prisma.notification_rules.findMany;
  prisma.notification_rules.findMany = async () => [{
    id: "alert-organiser", olympiad_id: "olympiad", name: "Check round",
    trigger: "round_opens", offset_minutes: 60, recipient: "registered_educators",
    action: "alert_organiser", condition: null,
  }];
  try {
    assert.equal(await delivery.deliverDueNotifications(now), 1);
    assert.ok(deliveries.has("alert-organiser:round:organiser"));
    assert.equal(await delivery.deliverDueNotifications(now), 0);
  } finally {
    prisma.notification_rules.findMany = original;
  }
});

test("certificate PDF is structurally readable and escapes learner names", () => {
  const pdf = certificate.buildPdf([{ text: "Name (O'Neil) \\", size: 16, y: 500 }]);
  assert.match(pdf.toString(), /^%PDF-1\.4/);
  assert.ok(pdf.toString().includes("O'Neil"));
  const match = pdf.toString().match(/startxref\n(\d+)/);
  assert.equal(pdf.subarray(Number(match[1]), Number(match[1]) + 4).toString(), "xref");
});
