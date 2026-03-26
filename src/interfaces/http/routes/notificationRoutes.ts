import express from 'express';
import prisma from '../../../infrastructure/database/prisma';
import { authMiddleware } from '../middlewares/authMiddleware';

const router = express.Router();

// Get unread notifications for a user
router.get('/', authMiddleware, async (req: any, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });

        const notifications = await prisma.notification.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            take: 50 // Limit to recent 50
        });

        res.json(notifications);
    } catch (error) {
        console.error('Fetch notifications error:', error);
        res.status(500).json({ error: 'Failed to fetch notifications' });
    }
});

// Mark a specific notification as read
router.put('/:id/read', authMiddleware, async (req: any, res) => {
    try {
        const { id } = req.params;
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });

        const notification = await prisma.notification.updateMany({
            where: { id, userId },
            data: { isRead: true }
        });

        if (notification.count === 0) {
             return res.status(404).json({ error: 'Notification not found' });
        }

        res.json({ message: 'Marked as read' });
    } catch (error) {
        console.error('Mark notification read error:', error);
        res.status(500).json({ error: 'Failed to mark notification as read' });
    }
});

// Mark all notifications as read
router.put('/read-all', authMiddleware, async (req: any, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });

        await prisma.notification.updateMany({
            where: { userId, isRead: false },
            data: { isRead: true }
        });

        res.json({ message: 'All marked as read' });
    } catch (error) {
        console.error('Mark all notifications read error:', error);
        res.status(500).json({ error: 'Failed to mark all notifications as read' });
    }
});

export default router;
