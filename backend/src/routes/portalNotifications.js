const router = require('express').Router();
const prisma = require('../config/database').default;
const { requireAuth } = require('../middlewares/auth');
router.use(requireAuth);
router.get('/', async (req, res, next) => {
    try {
        const notifications = await prisma.portal_notifications.findMany({
            where: { user_id: req.user.userId },
            orderBy: { created_at: 'desc' },
            take: 50,
            select: {
                id: true,
                title: true,
                body: true,
                created_at: true,
                read_at: true,
                round_id: true,
            },
        });
        res.json({ success: true, data: { notifications } });
    } catch (err) {
        next(err);
    }
});
router.patch('/:id/read', async (req, res, next) => {
    try {
        await prisma.portal_notifications.updateMany({
            where: {
                id: req.params.id,
                user_id: req.user.userId,
                read_at: null,
            },
            data: { read_at: new Date() },
        });
        res.json({ success: true, data: { message: 'Read' } });
    } catch (err) {
        next(err);
    }
});
module.exports = router;
