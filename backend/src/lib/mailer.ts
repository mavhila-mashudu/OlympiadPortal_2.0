import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false, // true for 465, false for other ports
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
}: {
  to: string;
  schoolName: string;
  olympiadName: string;
  inviteCode: string;
}) {
  // If SMTP is not configured in dev, log code to console instead of crashing
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.log("--------------------------------------------------");
    console.log("SMTP Credentials missing in .env. Invitation Code Generated:");
    console.log(`To: ${to}`);
    console.log(`School: ${schoolName}`);
    console.log(`Olympiad: ${olympiadName}`);
    console.log(`Invite Code: ${inviteCode}`);
    console.log("--------------------------------------------------");
    return;
  }

  const mailOptions = {
    from: `"National Olympiad Office" <${process.env.SMTP_USER}>`,
    to,
    subject: `Invitation to join ${olympiadName}`,
    html: `
      <h2>School Invitation</h2>
      <p>Your school <strong>${schoolName}</strong> has been invited to participate in <strong>${olympiadName}</strong>.</p>
      <p>Use the following invite code to register your educator account:</p>
      <h3 style="background: #f4f4f4; padding: 10px; display: inline-block;">${inviteCode}</h3>
    `,
  };

  await transporter.sendMail(mailOptions);
}