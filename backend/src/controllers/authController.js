// @ts-nocheck
const prisma = require('../config/database').default;
const authService = require('../services/authService');
const passwordResetService = require('../services/passwordResetService');
const schoolInvitations = require('../services/schoolInvitationService');
const { UnauthorizedError } = require('../errors/AppError');

const register = async (req, res, next) => {
    try {
        const {
            full_name,
            email,
            password,
            role,
            school_id,
            school_name,
            invitation_code,
        } = req.body;
        const { user } = await authService.register({
            full_name,
            email,
            password,
            role,
            school_id,
            school_name,
            invitation_code,
        });

        res.status(201).json({ success: true, data: { user } });
    } catch (err) {
        next(err);
    }
};

// Public: what an invitation code leads to, so the signup form can show the
// school and the email it was sent to before the account is created.
const checkInvitation = async (req, res, next) => {
    try {
        const invitation = await schoolInvitations.checkCode(req.body.code);
        res.json({ success: true, data: { invitation } });
    } catch (err) {
        next(err);
    }
};

// Public: the school list that fills the signup form's dropdown.
const listSchools = async (_req, res, next) => {
    try {
        const schools = await authService.listSchools();
        res.json({ success: true, data: { schools } });
    } catch (err) {
        next(err);
    }
};

const me = async (req, res, next) => {
    try {
        const user = await prisma.users.findUnique({
            where: { id: req.user.userId },
            select: {
                id: true,
                full_name: true,
                email: true,
                role: true,
                created_at: true,
                school_memberships: {
                    select: {
                        school_id: true,
                        role: true,
                        status: true,
                        schools: { select: { name: true } },
                    },
                },
                educators: { select: { school_id: true, schools: true } },
                entrants: { select: { school_id: true, status: true, schools: true } },
            },
        });

        res.json({ success: true, data: { user } });
    } catch (err) {
        next(err);
    }
};

const logout = async (req, res, next) => {
    try {
        await authService.logout(req.accessToken);
        res.json({ success: true, data: { message: 'Logged out' } });
    } catch (err) {
        next(err);
    }
};

const deleteAccount = async (req, res, next) => {
    try {
        await authService.deleteAccount(req.user.userId);
        res.json({ success: true, data: { message: 'Account deleted' } });
    } catch (err) {
        next(err);
    }
};

// Public: emails a password reset link. The reply is the same whether or not
// the address has an account.
const forgotPassword = async (req, res, next) => {
    try {
        await passwordResetService.requestPasswordReset(req.body.email);
        res.json({
            success: true,
            data: {
                message:
                    'If an account exists for that address, a reset link is on its way.',
            },
        });
    } catch (err) {
        next(err);
    }
};

const getEducatorOlympiads = async (req, res, next) => {
    try {
        const educator = await prisma.educators.findUnique({
            where: { user_id: req.user.userId },
        });
        if (!educator)
            throw new UnauthorizedError('Educator profile not found');
        const olympiads = await authService.listEducatorOlympiads(
            educator.school_id
        );
        res.json({ success: true, data: { olympiads } });
    } catch (err) {
        next(err);
    }
};

module.exports = {
    register,
    checkInvitation,
    listSchools,
    me,
    logout,
    deleteAccount,
    forgotPassword,
    getEducatorOlympiads,
};
