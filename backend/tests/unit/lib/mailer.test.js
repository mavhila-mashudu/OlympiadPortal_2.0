jest.mock("nodemailer", () => ({ createTransport: jest.fn() }));

const SMTP_KEYS = ["SMTP_HOST", "SMTP_PORT", "SMTP_SECURE", "SMTP_USER", "SMTP_PASS"];
const originalEnv = Object.fromEntries(SMTP_KEYS.map((k) => [k, process.env[k]]));

// The transporter is created when the module loads, so every test loads a
// fresh copy with the environment it needs.
const loadMailer = (env = {}) => {
  jest.resetModules();
  for (const key of SMTP_KEYS) delete process.env[key];
  Object.assign(process.env, env);

  const nodemailer = require("nodemailer");
  const sendMail = jest.fn().mockResolvedValue({ messageId: "1" });
  nodemailer.createTransport.mockReturnValue({ sendMail });
  const mailer = require("../../../src/lib/mailer");
  return { mailer, nodemailer, sendMail };
};

const configured = { SMTP_USER: "noreply@olympiad.test", SMTP_PASS: "app-password" };

let consoleLog;
beforeEach(() => {
  consoleLog = jest.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => {
  consoleLog.mockRestore();
  for (const key of SMTP_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
});

describe("transport configuration", () => {
  it("defaults to Gmail on port 587 without implicit TLS", () => {
    const { nodemailer } = loadMailer(configured);
    expect(nodemailer.createTransport).toHaveBeenCalledWith({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: { user: "noreply@olympiad.test", pass: "app-password" },
    });
  });

  it("uses the configured host, port and TLS setting", () => {
    const { nodemailer } = loadMailer({
      ...configured,
      SMTP_HOST: "mail.example.test",
      SMTP_PORT: "465",
      SMTP_SECURE: "true",
    });
    expect(nodemailer.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ host: "mail.example.test", port: 465, secure: true }),
    );
  });

  it("only enables TLS for the exact value 'true'", () => {
    const { nodemailer } = loadMailer({ ...configured, SMTP_SECURE: "yes" });
    expect(nodemailer.createTransport).toHaveBeenCalledWith(expect.objectContaining({ secure: false }));
  });

  it("falls back to port 587 for a non-numeric port", () => {
    const { nodemailer } = loadMailer({ ...configured, SMTP_PORT: "smtp" });
    expect(nodemailer.createTransport).toHaveBeenCalledWith(expect.objectContaining({ port: 587 }));
  });
});

const cases = [
  [
    "sendSchoolInviteEmail",
    {
      to: "head@school.test",
      schoolName: "Parktown High",
      olympiadName: "Maths Olympiad",
      inviteCode: "SCH-AB12",
      registrationUrl: "https://app.test/register?token=abc",
    },
    "Invitation to register Parktown High for Maths Olympiad",
  ],
  [
    "sendStudentInviteEmail",
    {
      to: "learner@school.test",
      olympiadName: "Maths Olympiad",
      inviteCode: "STU-1234-ABCD",
      registrationUrl: "https://app.test/register?token=def",
    },
    "Invitation to register for Maths Olympiad",
  ],
  [
    "sendEducatorInviteEmail",
    {
      to: "teacher@school.test",
      olympiadName: "Maths Olympiad",
      inviteCode: "EDU-1234-ABCD",
      registrationUrl: "https://app.test/register?token=ghi",
    },
    "Invitation to coordinate Maths Olympiad",
  ],
];

describe.each(cases)("%s", (fnName, input, subject) => {
  it("sends the invitation with the code and registration link", async () => {
    const { mailer, sendMail } = loadMailer(configured);

    await expect(mailer[fnName](input)).resolves.toEqual({ delivered: true });

    expect(sendMail).toHaveBeenCalledTimes(1);
    const message = sendMail.mock.calls[0][0];
    expect(message).toMatchObject({
      from: '"National Olympiad Office" <noreply@olympiad.test>',
      to: input.to,
      subject,
    });
    expect(message.html).toContain(input.inviteCode);
    expect(message.html).toContain(`href="${input.registrationUrl}"`);
    expect(message.html).toContain(input.olympiadName);
  });

  it.each([
    ["no SMTP user", { SMTP_PASS: "app-password" }],
    ["no SMTP password", { SMTP_USER: "noreply@olympiad.test" }],
  ])("logs the invitation instead of sending when there is %s", async (_label, env) => {
    const { mailer, sendMail } = loadMailer(env);

    await expect(mailer[fnName](input)).resolves.toEqual({ delivered: false });
    expect(sendMail).not.toHaveBeenCalled();
    expect(consoleLog.mock.calls.flat().join("\n")).toContain(input.registrationUrl);
  });

  it("propagates a delivery failure", async () => {
    const { mailer, sendMail } = loadMailer(configured);
    sendMail.mockRejectedValue(new Error("SMTP auth failed"));
    await expect(mailer[fnName](input)).rejects.toThrow("SMTP auth failed");
  });
});

it("includes the school name in the school invitation body", async () => {
  const { mailer, sendMail } = loadMailer(configured);
  await mailer.sendSchoolInviteEmail(cases[0][1]);
  expect(sendMail.mock.calls[0][0].html).toContain("Parktown High");
});
