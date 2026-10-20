// @ts-nocheck
const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const {
    register,
    logout,
    forgotPassword,
} = require('../controllers/authController');
const { requireAuth } = require('../middlewares/auth');
const validate = require('../middlewares/validate');
// Shared with the other public endpoints — see routes/schools.js
const { publicAuthLimiter } = require('../middlewares/rateLimit');

const passwordRule = body('password')
    .isLength({ min: 8 })
    .withMessage('Min 8 characters')
    .matches(/[A-Z]/)
    .withMessage('Needs uppercase')
    .matches(/[0-9]/)
    .withMessage('Needs a number');

const accountRules = [
    body('full_name').trim().notEmpty().withMessage('Full name is required'),
    body('email')
        .trim()
        .isEmail()
        .withMessage('Valid email required')
        .toLowerCase(),
    passwordRule,
];

// Anyone may sign up as an educator or a student. Organisers are NOT on this
// list: the role carries authority over every olympiad, so organiser accounts
// are provisioned by the portal administrator (scripts/createOrganiser.js).
// Educators and students say which school they belong to; a student must pick
// one that already exists, while an educator may name a new school and bring
// it onto the platform.
const registerRules = [
    ...accountRules,
    body('role')
        .isIn(['educator', 'student'])
        .withMessage('Choose educator or student'),
    body('school_id')
        .optional({ values: 'falsy' })
        .isUUID()
        .withMessage('Select a valid school'),
    body('school_name')
        .optional({ values: 'falsy' })
        .trim()
        .isLength({ max: 200 }),
    // A matching educator or student code approves their signup without a
    // manual request. Without a code, the existing approval queue applies.
    body('invitation_code')
        .optional({ values: 'falsy' })
        .isString()
        .isLength({ max: 40 })
        .withMessage('Invitation code is too long'),
    body().custom((value) => {
        if (
            value.role === 'student' &&
            !value.school_id &&
            !value.invitation_code
        ) {
            throw new Error('Select your school from the list');
        }
        if (
            value.role === 'educator' &&
            !value.invitation_code &&
            !value.school_id &&
            !(value.school_name || '').trim()
        ) {
            throw new Error('Select your school, or enter its name');
        }
        return true;
    }),
];

router.post('/register', publicAuthLimiter, registerRules, validate, register);
router.post(
    '/forgot-password',
    publicAuthLimiter,
    body('email')
        .trim()
        .isEmail()
        .withMessage('Valid email required')
        .toLowerCase(),
    validate,
    forgotPassword
);

router.post('/logout', requireAuth, logout);

module.exports = router;
