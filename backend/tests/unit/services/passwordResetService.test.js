// Password reset emails go out through EmailJS with a link Supabase makes,
// because Supabase's own sender allows only a few emails an hour.
jest.mock('../../../src/config/database', () => ({
    __esModule: true,
    default: require('../helpers/prismaMock').prisma,
}));
jest.mock('../../../src/config/supabase', () => ({
    auth: {
        resetPasswordForEmail: jest.fn(),
        admin: { generateLink: jest.fn() },
    },
}));
jest.mock('../../../src/config/env', () => ({
    frontend: { url: 'https://olympiad.test/' },
}));
jest.mock('../../../src/lib/mailer', () => ({
    isMailerConfigured: jest.fn(),
    sendPasswordResetEmail: jest.fn(),
}));

const { prisma, resetPrismaMock } = require('../helpers/prismaMock');
const supabase = require('../../../src/config/supabase');
const mailer = require('../../../src/lib/mailer');
const {
    requestPasswordReset,
    resetPasswordResetThrottle,
    RESEND_AFTER_MS,
} = require('../../../src/services/passwordResetService');

const RESET_URL =
    'https://olympiad.test/reset-password?token_hash=hashed-abc&type=recovery';
let warn;

beforeEach(() => {
    resetPrismaMock();
    resetPasswordResetThrottle();
    prisma.users.findFirst.mockResolvedValue({ id: 'user-1' });
    mailer.isMailerConfigured.mockReset().mockReturnValue(true);
    mailer.sendPasswordResetEmail
        .mockReset()
        .mockResolvedValue({ delivered: true });
    supabase.auth.admin.generateLink.mockReset().mockResolvedValue({
        data: { properties: { hashed_token: 'hashed-abc' } },
        error: null,
    });
    supabase.auth.resetPasswordForEmail
        .mockReset()
        .mockResolvedValue({ data: {}, error: null });
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => warn.mockRestore());

describe('requestPasswordReset', () => {
    it('emails a link to the reset page through EmailJS, without Supabase sending anything', async () => {
        await requestPasswordReset('  Thandi@Olympiad.test ');

        expect(prisma.users.findFirst).toHaveBeenCalledWith({
            where: { email: 'thandi@olympiad.test', deleted_at: null },
            select: { id: true },
        });
        expect(supabase.auth.admin.generateLink).toHaveBeenCalledWith({
            type: 'recovery',
            email: 'thandi@olympiad.test',
        });
        expect(mailer.sendPasswordResetEmail).toHaveBeenCalledWith({
            to: 'thandi@olympiad.test',
            resetUrl: RESET_URL,
        });
        expect(supabase.auth.resetPasswordForEmail).not.toHaveBeenCalled();
    });

    it("sends nothing for an address without an account, and doesn't say so", async () => {
        prisma.users.findFirst.mockResolvedValue(null);

        await expect(
            requestPasswordReset('nobody@olympiad.test')
        ).resolves.toBeUndefined();
        expect(supabase.auth.admin.generateLink).not.toHaveBeenCalled();
        expect(mailer.sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it('sends one email per address a minute, however often the form is sent', async () => {
        const now = Date.now();
        await requestPasswordReset('thandi@olympiad.test', { now });
        await requestPasswordReset('THANDI@olympiad.test', { now: now + 1000 });
        await requestPasswordReset('sipho@olympiad.test', { now: now + 1000 });
        expect(mailer.sendPasswordResetEmail).toHaveBeenCalledTimes(2);

        await requestPasswordReset('thandi@olympiad.test', {
            now: now + RESEND_AFTER_MS,
        });
        expect(mailer.sendPasswordResetEmail).toHaveBeenCalledTimes(3);
    });

    it("falls back to Supabase's sender when EmailJS isn't set up", async () => {
        mailer.isMailerConfigured.mockReturnValue(false);

        await requestPasswordReset('thandi@olympiad.test');

        expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledWith(
            'thandi@olympiad.test',
            {
                redirectTo: 'https://olympiad.test/reset-password',
            }
        );
        expect(supabase.auth.admin.generateLink).not.toHaveBeenCalled();
    });

    it("falls back to Supabase's sender when EmailJS can't deliver", async () => {
        mailer.sendPasswordResetEmail.mockResolvedValue({ delivered: false });

        await requestPasswordReset('thandi@olympiad.test');

        expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledTimes(1);
    });

    it("logs, rather than reports, a link Supabase couldn't make", async () => {
        supabase.auth.admin.generateLink.mockResolvedValue({
            data: null,
            error: { message: 'User not found' },
        });

        await expect(
            requestPasswordReset('thandi@olympiad.test')
        ).resolves.toBeUndefined();
        expect(mailer.sendPasswordResetEmail).not.toHaveBeenCalled();
        expect(warn).toHaveBeenCalledWith(
            '[password reset] Supabase could not make a reset link: User not found'
        );
    });

    it("logs, rather than reports, Supabase's sender failing", async () => {
        mailer.isMailerConfigured.mockReturnValue(false);
        supabase.auth.resetPasswordForEmail.mockResolvedValue({
            data: null,
            error: { message: 'email rate limit exceeded' },
        });

        await expect(
            requestPasswordReset('thandi@olympiad.test')
        ).resolves.toBeUndefined();
        expect(warn).toHaveBeenCalledWith(
            '[password reset] Supabase could not send the email: email rate limit exceeded'
        );
    });
});
