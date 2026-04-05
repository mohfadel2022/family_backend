import { Router } from 'express';
import { CostCenterService } from '../../../application/services/CostCenterService';
import { authMiddleware } from '../middlewares/authMiddleware';
import { checkPermission } from '../middlewares/roleMiddleware';
import prisma from '../../../infrastructure/database/prisma';

const router = Router();
const costCenterService = new CostCenterService();

// GET all cost centers
router.get('/', authMiddleware, checkPermission(['ENTITIES_VIEW', 'JOURNAL_VIEW', 'RECEIPT_VIEW', 'PAYMENT_VIEW']), async (req: any, res) => {
  try {
    let branchId = req.query.branchId as string;
    // Basic Encargado check - can only see cost centers for their branch
    if (req.user.role === 'ENCARGADO') {
      const allowedEntities = await prisma.entity.findMany({ where: { userId: req.user.id } }) || [];
      const allowedBranchIds = allowedEntities.map((e: any) => e.branchId);

      if (!branchId && allowedBranchIds.length === 1) {
        branchId = allowedBranchIds[0];
      } else if (branchId && !allowedBranchIds.includes(branchId)) {
        return res.status(403).json({ error: 'ليس لديك صلاحية الوصول למراكز هذا الفرع' });
      }
    }
    const costCenters = await costCenterService.getCostCenters(branchId);
    res.json(costCenters);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
});

// GET cost center summary report
router.get('/reports/summary', authMiddleware, checkPermission(['REPORTS_COST_CENTERS_VIEW', 'REPORTS_VIEW']), async (req: any, res) => {
  try {
    let branchId = req.query.branchId as string;
    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;

    if (req.user.role === 'ENCARGADO') {
      const allowedEntities = await prisma.entity.findMany({ where: { userId: req.user.id } });
      const allowedBranchIds = allowedEntities.map((e: any) => e.branchId);

      if (!branchId && allowedBranchIds.length === 1) {
        branchId = allowedBranchIds[0];
      } else if (branchId && !allowedBranchIds.includes(branchId)) {
        return res.status(403).json({ error: 'ليس لديك صلاحية الوصول لتقارير هذا الفرع' });
      } else if (!branchId) {
        return res.status(400).json({ error: 'يجب تحديد الفرع' });
      }
    }
    const accountId = req.query.accountId as string | undefined;
    
    const report = await costCenterService.getCostCenterSummaryReport(branchId, startDate, endDate, accountId);
    res.json(report);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
});

// GET cost center details report
router.get('/reports/:id/details', authMiddleware, checkPermission(['REPORTS_COST_CENTERS_VIEW', 'REPORTS_VIEW']), async (req: any, res) => {
  try {
    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
    
    // Encargado check
    if (req.user.role === 'ENCARGADO') {
      const costCenter = await prisma.costCenter.findUnique({ where: { id: req.params.id } });
      const allowedEntities = await prisma.entity.findMany({ where: { userId: req.user.id } });
      const allowedBranchIds = allowedEntities.map((e: any) => e.branchId);
      
      if (costCenter && !allowedBranchIds.includes(costCenter.branchId)) {
        return res.status(403).json({ error: 'ليس لديك صلاحية الوصول لهذا المركز' });
      }
    }

    const accountId = req.query.accountId as string | undefined;

    const report = await costCenterService.getCostCenterDetailsReport(req.params.id, startDate, endDate, accountId);
    res.json(report);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
});

// GET next available code
router.get('/next-code', authMiddleware, checkPermission(['ENTITIES_CREATE']), async (req, res) => {
  try {
    const parentId = req.query.parentId as string || null;
    const nextCode = await costCenterService.getNextAvailableCode(parentId);
    res.json({ nextCode });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
});

// GET single cost center
router.get('/:id', authMiddleware, checkPermission(['ENTITIES_VIEW']), async (req, res) => {
  try {
    const costCenter = await costCenterService.getCostCenterById(req.params.id);
    res.json(costCenter);
  } catch (error: any) {
    res.status(404).json({ error: error.message });
  }
});

// POST new cost center
router.post('/', authMiddleware, checkPermission(['ENTITIES_CREATE']), async (req, res) => {
  try {
    const { name, code, status, branchId, parentId } = req.body;
    if (!name || !branchId) {
      return res.status(400).json({ error: 'اسم المركز والفرع مطلوبين' });
    }
    const result = await costCenterService.createCostCenter({ name, code, status, branchId, parentId });
    res.status(201).json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// PUT update cost center
router.put('/:id', authMiddleware, checkPermission(['ENTITIES_EDIT']), async (req, res) => {
  try {
    const { name, code, status, branchId, parentId } = req.body;
    const result = await costCenterService.updateCostCenter(req.params.id, { name, code, status, branchId, parentId });
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// DELETE cost center
router.delete('/:id', authMiddleware, checkPermission(['ENTITIES_DELETE']), async (req, res) => {
  try {
    await costCenterService.deleteCostCenter(req.params.id);
    res.status(204).end();
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// GET vouchers missing cost centers report
router.get('/reports/vouchers-missing-cost-centers', authMiddleware, checkPermission(['REPORTS_COST_CENTERS_VIEW', 'REPORTS_VIEW']), async (req: any, res) => {
  try {
    let branchId = req.query.branchId as string;
    
    // Encargado check
    if (req.user.role === 'ENCARGADO') {
      const allowedEntities = await prisma.entity.findMany({ where: { userId: req.user.id } });
      const allowedBranchIds = allowedEntities.map((e: any) => e.branchId);

      if (!branchId && allowedBranchIds.length === 1) {
        branchId = allowedBranchIds[0];
      } else if (branchId && !allowedBranchIds.includes(branchId)) {
        return res.status(403).json({ error: 'ليس لديك صلاحية الوصول لتقارير هذا الفرع' });
      } else if (!branchId) {
        return res.status(400).json({ error: 'يجب تحديد الفرع' });
      }
    }

    const report = await costCenterService.getVouchersMissingCostCenters(branchId);
    res.json(report);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
});

// PATCH update voucher distributions
router.patch('/vouchers/:id/distributions', authMiddleware, checkPermission(['JOURNAL_EDIT', 'RECEIPT_EDIT', 'PAYMENT_EDIT']), async (req: any, res) => {
  try {
    const updated = await costCenterService.updateVoucherDistributions(req.params.id, req.body.distributions);
    res.json(updated);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

export default router;
