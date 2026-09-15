import nodemailer from "nodemailer";

type Email = { to: string; subject: string; html: string };

const emailFrom = () =>
  process.env.RESEND_FROM || process.env.EMAIL_FROM || "Olympiad Portal <onboarding@resend.dev>";

const smtpTransporter = () => nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: Number(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === "true",
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  connectionTimeout: 8_000,
  greetingTimeout: 8_000,
  socketTimeout: 10_000,
});

const logUndeliveredEmail = (email: Email, reason: string) => {
  console.warn(`Invitation email was not delivered (${reason}).`, { to: email.to, subject: email.subject });
};

/** Production uses Resend's HTTPS API; Render free instances can block SMTP. */
async function deliver(email: Email): Promise<{ delivered: boolean }> {
  if (process.env.RESEND_API_KEY) {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
          "User-Agent": "OlympiadPortal/1.0",
        },
        body: JSON.stringify({ from: emailFrom(), to: [email.to], subject: email.subject, html: email.html }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        const details = await response.text();
        logUndeliveredEmail(email, `Resend ${response.status}: ${details.slice(0, 300)}`);
        return { delivered: false };
      }
      return { delivered: true };
    } catch (error) {
      logUndeliveredEmail(email, `Resend request failed: ${error instanceof Error ? error.message : "unknown error"}`);
      return { delivered: false };
    }
  }

  // Never wait on blocked SMTP from a Render service. The invitation remains
  // valid and the frontend receives a clear delivery warning instead of 500.
  if (process.env.NODE_ENV === "production") {
    logUndeliveredEmail(email, "RESEND_API_KEY is not configured");
    return { delivered: false };
  }

  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.log("Invitation email preview (development):", { to: email.to, subject: email.subject });
    return { delivered: false };
  }

  try {
    await smtpTransporter().sendMail({ from: emailFrom(), ...email });
    return { delivered: true };
  } catch (error) {
    logUndeliveredEmail(email, `SMTP failed: ${error instanceof Error ? error.message : "unknown error"}`);
    return { delivered: false };
  }
}

const registrationLink = (url: string) =>
  `<p><a href="${url}">Click here to register</a></p><p>If the button does not work, copy this link into your browser:<br />${url}</p>`;

export async function sendSchoolInviteEmail({ to, schoolName, olympiadName, inviteCode, registrationUrl }: { to: string; schoolName: string; olympiadName: string; inviteCode: string; registrationUrl: string }) {
  return deliver({ to, subject: `Invitation to register ${schoolName} for ${olympiadName}`, html: `<h2>School invitation</h2><p>You've been invited to register <strong>${schoolName}</strong> for <strong>${olympiadName}</strong>.</p><p>Your registration code is:</p><h3>${inviteCode}</h3>${registrationLink(registrationUrl)}` });
}

export async function sendStudentInviteEmail({ to, olympiadName, inviteCode, registrationUrl }: { to: string; olympiadName: string; inviteCode: string; registrationUrl: string }) {
  return deliver({ to, subject: `Invitation to register for ${olympiadName}`, html: `<h2>Olympiad student invitation</h2><p>You've been invited to register for <strong>${olympiadName}</strong>.</p><p>Your registration code is:</p><h3>${inviteCode}</h3>${registrationLink(registrationUrl)}` });
}

export async function sendEducatorInviteEmail({ to, olympiadName, inviteCode, registrationUrl }: { to: string; olympiadName: string; inviteCode: string; registrationUrl: string }) {
  return deliver({ to, subject: `Invitation to coordinate ${olympiadName}`, html: `<h2>Educator invitation</h2><p>You have been invited to help manage students for <strong>${olympiadName}</strong>.</p><p>Your registration code is:</p><h3>${inviteCode}</h3>${registrationLink(registrationUrl)}` });
}
