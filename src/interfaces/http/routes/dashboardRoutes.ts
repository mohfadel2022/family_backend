import { Router } from 'express';
import { DashboardService } from '../../../application/services/DashboardService';
import { authMiddleware } from '../middlewares/authMiddleware';
import fs from 'fs';
import path from 'path';

const router = Router();
const dashboardService = new DashboardService();

router.get('/', authMiddleware, async (req: any, res) => {
    try {
        const branchId = req.query.branchId as string;
        const year = req.query.year ? parseInt(req.query.year as string) : undefined;
        const entityId = req.query.entityId as string;
        const summary = await dashboardService.getSummary(req.user, branchId, year, entityId);
        res.json(summary);
    } catch (error: any) {
        const errorLog = `[${new Date().toISOString()}] DASHBOARD ERROR: ${error.message}\n${error.stack}\n\n`;
        const logDir = path.join(process.cwd(), 'logs');
        if (!fs.existsSync(logDir)) fs.mkdirSync(logDir);
        fs.appendFileSync(path.join(logDir, 'dashboard-errors.log'), errorLog);
        
        console.error('DASHBOARD ROUTE ERROR:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
