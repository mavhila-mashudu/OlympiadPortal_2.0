// @ts-nocheck
const crypto = require("crypto");

/**
 * Generates a human-readable invitation code
 * Format: TYPE-XXXX-XXXX (e.g. EDU-X7K9-B3M1)
 *
 * Short enough to type, unique enough to be safe
 */
const generateInvitationCode = (type) => {
  const prefix = {
    school: "SCH",
    educator: "EDU",
    student: "STU",
  }[type];

  const part1 = crypto.randomBytes(2).toString("hex").toUpperCase();
  const part2 = crypto.randomBytes(2).toString("hex").toUpperCase();

  return `${prefix}-${part1}-${part2}`;
};

/**
 * Generates expiry date for an invitation
 * Schools and educators get 7 days
 * Students get 30 days (educators distribute codes in bulk)
 */
const getInvitationExpiry = (type) => {
  const days = type === "student" ? 30 : 7;
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + days);
  return expiry;
};

module.exports = { generateInvitationCode, getInvitationExpiry };
