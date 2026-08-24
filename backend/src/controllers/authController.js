// @ts-nocheck
const authService = require("../services/authService");

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
    const { full_name, email, password, code } = req.body;
    const { user } = await authService.registerWithCode({
      full_name,
      email,
      password,
      code,
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
    const prisma = require("../config/database").default;
    const user = await prisma.users.findUnique({
      where: { id: req.user.userId },
      select: {
        id: true,
        full_name: true,
        email: true,
        role: true,
        created_at: true,
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
    const prisma = require("../config/database").default;
    const educator = await prisma.educators.findUnique({
      where: { user_id: req.user.userId },
    });
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
    const prisma = require("../config/database").default;
    const educator = await prisma.educators.findUnique({
      where: { user_id: req.user.userId },
    });
    const codes = await authService.generateStudentCodes({
      count: parseInt(count),
      schoolId: educator.school_id,
      olympiadId: olympiad_id,
      createdById: req.user.userId,
    });
    res.status(201).json({ success: true, data: { codes } });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  registerOrganiser,
  registerWithCode,
  validateCode,
  me,
  deleteAccount,
  inviteSchool,
  inviteEducator,
  generateStudentCodes,
};
