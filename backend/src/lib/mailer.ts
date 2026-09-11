import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: Number(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === "true", // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export async function sendSchoolInviteEmail({
  to,
  schoolName,
  olympiadName,
  inviteCode,
  registrationUrl,
}: {
  to: string;
  schoolName: string;
  olympiadName: string;
  inviteCode: string;
  registrationUrl: string;
}) {
  // If SMTP is not configured in dev, log code to console instead of crashing
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.log("--------------------------------------------------");
    console.log("SMTP Credentials missing in .env. Invitation Code Generated:");
    console.log(`To: ${to}`);
    console.log(`School: ${schoolName}`);
    console.log(`Olympiad: ${olympiadName}`);
    console.log(`Invite Code: ${inviteCode}`);
    console.log(`Registration link: ${registrationUrl}`);
    console.log("--------------------------------------------------");
    return { delivered: false };
  }

  const mailOptions = {
    from: `"National Olympiad Office" <${process.env.SMTP_USER}>`,
    to,
    subject: `Invitation to register ${schoolName} for ${olympiadName}`,
    html: `
      <h2>School Invitation</h2>
      <p>You've been invited to register <strong>${schoolName}</strong> for the <strong>${olympiadName}</strong>.</p>
      <p>Your registration code is:</p>
      <h3 style="background: #f4f4f4; padding: 10px; display: inline-block;">${inviteCode}</h3>
      <p><a href="${registrationUrl}">Click here to register</a></p>
      <p>If the button does not work, copy this link into your browser:<br />${registrationUrl}</p>
    `,
  };

  await transporter.sendMail(mailOptions);
  return { delivered: true };
}

export async function sendStudentInviteEmail({
  to,
  olympiadName,
  inviteCode,
  registrationUrl,
}: {
  to: string;
  olympiadName: string;
  inviteCode: string;
  registrationUrl: string;
}) {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.log("--------------------------------------------------");
    console.log(
      "SMTP Credentials missing in .env. Student invitation generated:",
    );
    console.log(`To: ${to}`);
    console.log(`Olympiad: ${olympiadName}`);
    console.log(`Invite Code: ${inviteCode}`);
    console.log(`Registration link: ${registrationUrl}`);
    console.log("--------------------------------------------------");
    return { delivered: false };
  }

  await transporter.sendMail({
    from: `"National Olympiad Office" <${process.env.SMTP_USER}>`,
    to,
    subject: `Invitation to register for ${olympiadName}`,
    html: `
      <h2>Olympiad student invitation</h2>
      <p>You've been invited to register for <strong>${olympiadName}</strong>.</p>
      <p>Your registration code is:</p>
      <h3 style="background: #f4f4f4; padding: 10px; display: inline-block;">${inviteCode}</h3>
      <p><a href="${registrationUrl}">Click here to register</a></p>
      <p>If the button does not work, copy this link into your browser:<br />${registrationUrl}</p>
    `,
  });

  return { delivered: true };
}

export async function sendEducatorInviteEmail({
  to,
  olympiadName,
  inviteCode,
  registrationUrl,
}: {
  to: string;
  olympiadName: string;
  inviteCode: string;
  registrationUrl: string;
}) {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.log(`Educator invitation for ${to}: ${registrationUrl}`);
    return { delivered: false };
  }
  await transporter.sendMail({
    from: `"National Olympiad Office" <${process.env.SMTP_USER}>`,
    to,
    subject: `Invitation to coordinate ${olympiadName}`,
    html: `<h2>Educator invitation</h2><p>You have been invited to help manage students for <strong>${olympiadName}</strong>.</p><p>Your registration code is <strong>${inviteCode}</strong>.</p><p><a href="${registrationUrl}">Create your account</a></p>`,
  });
  return { delivered: true };
}
