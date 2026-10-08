// @ts-nocheck
const prisma = require("../config/database").default;
const supabase = require("../config/supabase");
const { frontend } = require("../config/env");
const { isMailerConfigured, sendPasswordResetEmail } = require("../lib/mailer");

// Supabase's own email sender allows only a few emails an hour for the whole
// project, so reset requests failed with "email rate limit exceeded". Instead
// Supabase makes the reset link without sending anything, and the link goes
// out through EmailJS like the portal's other emails. The link opens the same
// /reset-password page, which exchanges its one-time token as before.

// One reset email per address per minute, however often the form is sent
const RESEND_AFTER_MS = 60 * 1000;
const lastSentAt = new Map(); // email -> time of the last request

const recentlyRequested = (email, now) => {
  for (const [address, at] of lastSentAt) {
    if (now - at >= RESEND_AFTER_MS) lastSentAt.delete(address);
  }
  if (lastSentAt.has(email)) return true;
  lastSentAt.set(email, now);
  return false;
};

const resetPageUrl = () => `${frontend.url.replace(/\/+$/, "")}/reset-password`;

// Supabase's own sender: used when EmailJS isn't set up, or couldn't deliver
const sendThroughSupabase = async (email) => {
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: resetPageUrl() });
  if (error) console.warn(`[password reset] Supabase could not send the email: ${error.message}`);
};

// Always resolves the same way, so the form can't be used to find out who
// has an account. Failures are logged rather than returned for that reason.
const requestPasswordReset = async (rawEmail, { now = Date.now() } = {}) => {
  const email = String(rawEmail).trim().toLowerCase();
  if (recentlyRequested(email, now)) return;

  const user = await prisma.users.findFirst({
    where: { email, deleted_at: null },
    select: { id: true },
  });
  if (!user) return;

  if (!isMailerConfigured()) {
    await sendThroughSupabase(email);
    return;
  }

  const { data, error } = await supabase.auth.admin.generateLink({ type: "recovery", email });
  const tokenHash = data?.properties?.hashed_token;
  if (error || !tokenHash) {
    console.warn(`[password reset] Supabase could not make a reset link: ${error?.message ?? "no token returned"}`);
    return;
  }

  const resetUrl = `${resetPageUrl()}?token_hash=${encodeURIComponent(tokenHash)}&type=recovery`;
  const { delivered } = await sendPasswordResetEmail({ to: email, resetUrl });
  if (!delivered) await sendThroughSupabase(email);
};

// For tests: forget which addresses asked recently
const resetPasswordResetThrottle = () => lastSentAt.clear();

module.exports = { requestPasswordReset, resetPasswordResetThrottle, RESEND_AFTER_MS };
