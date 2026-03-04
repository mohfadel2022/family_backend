import { Router } from 'express';
import { DashboardService } from '../../../application/services/DashboardService';
import { authMiddleware } from '../middlewares/authMiddleware';

const router = Router();
const dashboardService = new DashboardService();

router.get('/', authMiddleware, async (req: any, res) => {
    try {
        const branchId = req.query.branchId as string;
        const summary = await dashboardService.getSummary(req.user, branchId);
        res.json(summary);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
