// @ts-nocheck
const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middlewares/auth');

// All routes require authenticated student
router.use(requireAuth);
router.get(
    '/:roundId/certificate',
    requireRole('student'),
    async (req, res, next) => {
        try {
            const {
                certificateForStudent,
            } = require('../services/certificateService');
            const pdf = await certificateForStudent(
                req.params.roundId,
                req.user.userId
            );
            res.set('Content-Type', 'application/pdf');
            res.set(
                'Content-Disposition',
                `attachment; filename="certificate-${req.params.roundId}.pdf"`
            );
            res.send(pdf);
        } catch (err) {
            next(err);
        }
    }
);

module.exports = router;
