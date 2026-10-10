// Invitation emails are sent through the EmailJS REST API. The tests replace
// fetch, so nothing leaves the machine, and check what would be sent.
const EMAILJS_KEYS = [
    'EMAILJS_SERVICE_ID',
    'EMAILJS_TEMPLATE_ID',
    'EMAILJS_USER_ID',
    'EMAILJS_PRIVATE_KEY',
];
const originalEnv = Object.fromEntries(
    EMAILJS_KEYS.map((k) => [k, process.env[k]])
);

const configured = {
    EMAILJS_SERVICE_ID: 'service_1',
    EMAILJS_TEMPLATE_ID: 'template_1',
    EMAILJS_USER_ID: 'user_1',
    EMAILJS_PRIVATE_KEY: 'private_1',
};

const loadMailer = (env = {}) => {
    jest.resetModules();
    for (const key of EMAILJS_KEYS) delete process.env[key];
    Object.assign(process.env, env);
    return require('../../../src/lib/mailer');
};

const school = {
    to: 'head@parktown.test',
    schoolName: 'Parktown High',
    olympiadName: 'Maths Olympiad 2026',
    inviteCode: 'SCH-AB12',
    registrationUrl: 'https://olympiad.test/register?token=abc',
};
const student = {
    to: 'learner@parktown.test',
    olympiadName: 'Maths Olympiad 2026',
    inviteCode: 'STU-1A2B-3C4D',
    registrationUrl: 'https://olympiad.test/register?token=def',
};
const educator = {
    to: 'colleague@parktown.test',
    olympiadName: 'Maths Olympiad 2026',
    inviteCode: 'EDU-1A2B-3C4D',
    registrationUrl: 'https://olympiad.test/register?token=ghi',
};

/** The request body EmailJS was called with. */
const sentEmail = () => JSON.parse(global.fetch.mock.calls[0][1].body);

let consoleLog;
let consoleWarn;
let consoleError;

beforeEach(() => {
    global.fetch = jest
        .fn()
        .mockResolvedValue({ ok: true, status: 200, text: async () => 'OK' });
    consoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
    consoleLog.mockRestore();
    consoleWarn.mockRestore();
    consoleError.mockRestore();
    delete global.fetch;
    for (const key of EMAILJS_KEYS) {
        if (originalEnv[key] === undefined) delete process.env[key];
        else process.env[key] = originalEnv[key];
    }
});

describe('sending through EmailJS', () => {
    it('posts the invitation to the EmailJS API with the configured account', async () => {
        const mailer = loadMailer(configured);

        await expect(mailer.sendSchoolInviteEmail(school)).resolves.toEqual({
            delivered: true,
        });

        expect(global.fetch).toHaveBeenCalledTimes(1);
        const [url, options] = global.fetch.mock.calls[0];
        expect(url).toBe('https://api.emailjs.com/api/v1.0/email/send');
        expect(options).toMatchObject({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
        });
        expect(sentEmail()).toMatchObject({
            service_id: 'service_1',
            template_id: 'template_1',
            user_id: 'user_1',
            accessToken: 'private_1',
            template_params: { to_email: school.to },
        });
    });

    it("gives up rather than hanging if EmailJS doesn't answer", async () => {
        const mailer = loadMailer(configured);
        await mailer.sendSchoolInviteEmail(school);
        expect(global.fetch.mock.calls[0][1].signal).toBeDefined();
    });
});

describe('each kind of invitation', () => {
    it.each([
        [
            'school',
            (mailer) => mailer.sendSchoolInviteEmail(school),
            'Invitation to register Parktown High for Maths Olympiad 2026',
            school,
        ],
        [
            'student',
            (mailer) => mailer.sendStudentInviteEmail(student),
            'Invitation to register for Maths Olympiad 2026',
            student,
        ],
        [
            'educator',
            (mailer) => mailer.sendEducatorInviteEmail(educator),
            'Invitation to coordinate Maths Olympiad 2026',
            educator,
        ],
    ])(
        'sends the %s invitation with its code and registration link',
        async (_label, send, subject, details) => {
            const mailer = loadMailer(configured);

            await expect(send(mailer)).resolves.toEqual({ delivered: true });

            const { template_params: params } = sentEmail();
            expect(params.to_email).toBe(details.to);
            expect(params.subject).toBe(subject);
            expect(params.html_content).toContain(details.inviteCode);
            expect(params.html_content).toContain(details.registrationUrl);
        }
    );
});

describe('the password reset email', () => {
    it('sends the one-time reset link', async () => {
        const mailer = loadMailer(configured);
        const resetUrl =
            'https://olympiad.test/reset-password?token_hash=abc&type=recovery';

        await expect(
            mailer.sendPasswordResetEmail({
                to: 'thandi@olympiad.test',
                resetUrl,
            })
        ).resolves.toEqual({ delivered: true });

        const { template_params: params } = sentEmail();
        expect(params.to_email).toBe('thandi@olympiad.test');
        expect(params.subject).toBe('Reset your Olympiad Portal password');
        expect(params.html_content).toContain(
            `<a href="${resetUrl}">Choose a new password</a>`
        );
    });
});

describe("when EmailJS can't be used", () => {
    it.each(EMAILJS_KEYS)(
        'reports the invitation as undelivered when %s is missing',
        async (missing) => {
            const env = { ...configured };
            delete env[missing];
            const mailer = loadMailer(env);

            await expect(
                mailer.sendStudentInviteEmail(student)
            ).resolves.toEqual({
                delivered: false,
            });

            // Nothing is sent, and the code is logged so it can still be passed on
            expect(global.fetch).not.toHaveBeenCalled();
            expect(consoleLog).toHaveBeenCalledWith(
                expect.stringContaining('not configured'),
                expect.objectContaining({ to: student.to })
            );
        }
    );

    it('reports an API error as undelivered instead of throwing', async () => {
        global.fetch.mockResolvedValue({
            ok: false,
            status: 422,
            text: async () => 'The user_id is invalid',
        });
        const mailer = loadMailer(configured);

        await expect(mailer.sendEducatorInviteEmail(educator)).resolves.toEqual(
            {
                delivered: false,
            }
        );
        expect(consoleWarn).toHaveBeenCalledWith(
            expect.stringContaining('not delivered'),
            expect.objectContaining({ to: educator.to })
        );
    });

    it('reports a failed request as undelivered instead of throwing', async () => {
        global.fetch.mockRejectedValue(new Error('fetch failed'));
        const mailer = loadMailer(configured);

        await expect(mailer.sendSchoolInviteEmail(school)).resolves.toEqual({
            delivered: false,
        });
        expect(consoleWarn).toHaveBeenCalledWith(
            expect.stringContaining('not delivered'),
            expect.objectContaining({ to: school.to })
        );
    });
});
