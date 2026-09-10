// @ts-nocheck
const prisma = require("../config/database").default;
const authService = require("../services/authService");
const { UnauthorizedError } = require("../errors/AppError");

const registerOrganiser = async (req, res, next) => {
  try {
    const { full_name, email, password, organiser_secret } = req.body;
    const { user } = await authService.registerOrganiser({
      full_name,
      email,
      password,
      organiserSecret: organiser_secret,
    });

    res.status(201).json({ success: true, data: { user } });
  } catch (err) {
    next(err);
  }
};

const registerWithCode = async (req, res, next) => {
  try {
    const { full_name, email, password, code, invite_token } = req.body;
    const { user } = await authService.registerWithCode({
      full_name,
      email,
      password,
      code,
      invite_token,
    });

    res.status(201).json({ success: true, data: { user } });
  } catch (err) {
    next(err);
  }
};

const validateCode = async (req, res, next) => {
  try {
    const result = await authService.validateInvitationCode(req.params.code);
    res.json({ success: true, data: result });
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
          where: { status: "active" },
          select: { school_id: true, role: true, schools: { select: { name: true } } },
        },
        educators: { select: { school_id: true, schools: true } },
        entrants: { select: { school_id: true, schools: true } },
      },
    });

    res.json({ success: true, data: { user } });
  } catch (err) {
    next(err);
  }
};

const deleteAccount = async (req, res, next) => {
  try {
    await authService.deleteAccount(req.user.userId);
    res.json({ success: true, data: { message: "Account deleted" } });
  } catch (err) {
    next(err);
  }
};

const inviteSchool = async (req, res, next) => {
  try {
    const { school_name, contact_email, olympiad_id } = req.body;
    const result = await authService.inviteSchool({
      schoolName: school_name,
      contactEmail: contact_email,
      olympiadId: olympiad_id,
      organiserId: req.user.userId,
    });

    res.status(201).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

const inviteEducator = async (req, res, next) => {
  try {
    const { email, olympiad_id } = req.body;
    const educator = await prisma.educators.findUnique({
      where: { user_id: req.user.userId },
    });

    if (!educator) {
      throw new UnauthorizedError("Educator profile not found");
    }

    const result = await authService.inviteEducator({
      email,
      schoolId: educator.school_id,
      olympiadId: olympiad_id,
      createdById: req.user.userId,
    });

    res.status(201).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

const generateStudentCodes = async (req, res, next) => {
  try {
    const { count, olympiad_id } = req.body;
    const educator = await prisma.educators.findUnique({
      where: { user_id: req.user.userId },
    });

    if (!educator) {
      throw new UnauthorizedError("Educator profile not found");
    }

    const codes = await authService.generateStudentCodes({
      count: parseInt(count, 10),
      schoolId: educator.school_id,
      olympiadId: olympiad_id,
      createdById: req.user.userId,
    });

    res.status(201).json({ success: true, data: { codes } });
  } catch (err) {
    next(err);
  }
};

const validateInviteToken = async (req, res, next) => {
  try {
    const result = await authService.validateInvitationToken(req.params.token);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

const getEducatorOlympiads = async (req, res, next) => {
  try {
    const educator = await prisma.educators.findUnique({ where: { user_id: req.user.userId } });
    if (!educator) throw new UnauthorizedError("Educator profile not found");
    const olympiads = await authService.listEducatorOlympiads(educator.school_id);
    res.json({ success: true, data: { olympiads } });
  } catch (err) {
    next(err);
  }
};

const inviteStudent = async (req, res, next) => {
  try {
    const educator = await prisma.educators.findUnique({ where: { user_id: req.user.userId } });
    if (!educator) throw new UnauthorizedError("Educator profile not found");
    const result = await authService.inviteStudent({
      email: req.body.email,
      olympiadId: req.body.olympiad_id,
      schoolId: educator.school_id,
      createdById: req.user.userId,
    });
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

const getStudentInvitations = async (req, res, next) => {
  try {
    const educator = await prisma.educators.findUnique({ where: { user_id: req.user.userId } });
    if (!educator) throw new UnauthorizedError("Educator profile not found");
    const invitations = await authService.listStudentInvitations(educator.school_id);
    res.json({ success: true, data: { invitations } });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  registerOrganiser,
  registerWithCode,
  validateCode,
  validateInviteToken,
  me,
  deleteAccount,
  inviteSchool,
  inviteEducator,
  generateStudentCodes,
  getEducatorOlympiads,
  inviteStudent,
  getStudentInvitations,
};
