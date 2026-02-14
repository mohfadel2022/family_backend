import { Router } from 'express';
import prisma from '../../../infrastructure/database/prisma';
import { authMiddleware } from '../middlewares/authMiddleware';
import { AccountService } from '../../../application/services/AccountService';
import { PeriodService } from '../../../application/services/PeriodService';
import { ExchangeReportService } from '../../../application/services/ExchangeReportService';

const router = Router();
const accountService = new AccountService();
const periodService = new PeriodService();
const exchangeService = new ExchangeReportService();

// Get all currencies
router.get('/', authMiddleware, async (req, res) => {
  try {
    const currencies = await prisma.currency.findMany();
    res.json(currencies);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get all accounts
router.get('/accounts', authMiddleware, async (req, res) => {
  try {
    const accounts = await prisma.account.findMany({
      include: { currency: true, branch: true }
    });
    res.json(accounts);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create account
router.post('/accounts', authMiddleware, async (req, res) => {
  try {
    const account = await accountService.createAccount(req.body);
    res.status(201).json(account);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update account
router.put('/accounts/:id', authMiddleware, async (req, res) => {
  try {
    const account = await accountService.updateAccount(req.params.id, req.body);
    res.json(account);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Delete account
router.delete('/accounts/:id', authMiddleware, async (req, res) => {
  try {
    const result = await accountService.deleteAccount(req.params.id);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get all branches
router.get('/branches', authMiddleware, async (req, res) => {
  try {
    const branches = await prisma.branch.findMany({
      include: { currency: true }
    });
    res.json(branches);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create branch
router.post('/branches', authMiddleware, async (req, res) => {
  try {
    const branch = await prisma.branch.create({ data: req.body });
    res.status(201).json(branch);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update branch
router.put('/branches/:id', authMiddleware, async (req, res) => {
  try {
    const branch = await prisma.branch.update({
      where: { id: req.params.id },
      data: req.body
    });
    res.json(branch);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Delete branch
router.delete('/branches/:id', authMiddleware, async (req, res) => {
  try {
    // Check if branch has accounts
    const accountsCount = await prisma.account.count({
      where: { branchId: req.params.id }
    });

    if (accountsCount > 0) {
      return res.status(400).json({ error: 'لا يمكن حذف الفرع لوجود حسابات مرتبطة به' });
    }

    // Check if branch has journal entries
    const entriesCount = await prisma.journalEntry.count({
      where: { branchId: req.params.id }
    });

    if (entriesCount > 0) {
      return res.status(400).json({ error: 'لا يمكن حذف الفرع لوجود قيود محاسبية مرتبطة به' });
    }

    const result = await prisma.branch.delete({ where: { id: req.params.id } });
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Currencies CRUD
router.post('/currencies', authMiddleware, async (req, res) => {
  try {
    const { isBase } = req.body;

    if (isBase) {
      // Unset any existing base currency
      await prisma.currency.updateMany({
        where: { isBase: true },
        data: { isBase: false }
      });
    }

    const currency = await prisma.currency.create({ data: req.body });
    res.status(201).json(currency);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/currencies/:id', authMiddleware, async (req, res) => {
  try {
    const { isBase } = req.body;

    if (isBase) {
      // Unset any other base currency
      await prisma.currency.updateMany({
        where: {
          isBase: true,
          id: { not: req.params.id }
        },
        data: { isBase: false }
      });
    }

    const currency = await prisma.currency.update({
      where: { id: req.params.id },
      data: req.body
    });
    res.json(currency);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/currencies/:id', authMiddleware, async (req, res) => {
  try {
    // Check if currency is used in accounts, branches or journal lines
    const [accountsCount, branchesCount, linesCount] = await Promise.all([
      prisma.account.count({ where: { currencyId: req.params.id } }),
      prisma.branch.count({ where: { currencyId: req.params.id } }),
      prisma.journalLine.count({ where: { currencyId: req.params.id } })
    ]);

    if (accountsCount > 0 || branchesCount > 0 || linesCount > 0) {
      return res.status(400).json({ error: 'لا يمكن حذف العملة لوجود حسابات أو فروع أو قيود مرتبطة بها' });
    }

    const result = await prisma.currency.delete({ where: { id: req.params.id } });
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Reports
router.get('/reports/trial-balance', authMiddleware, async (req, res) => {
  try {
    const branchId = req.query.branchId as string;
    const report = await accountService.getTrialBalance(branchId);
    res.json(report);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/reports/income-statement', authMiddleware, async (req, res) => {
  try {
    const branchId = req.query.branchId as string;
    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;

    const report = await accountService.getIncomeStatement(branchId, startDate, endDate);
    res.json(report);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/reports/account-statement', authMiddleware, async (req, res) => {
  try {
    const accountId = req.query.accountId as string;
    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;

    if (!accountId) return res.status(400).json({ error: 'accountId is required' });

    const report = await accountService.getAccountStatement(accountId, startDate, endDate);
    res.json(report);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/reports/exchange-report', authMiddleware, async (req, res) => {
  try {
    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
    const report = await exchangeService.getExchangeGainsLosses(startDate, endDate);
    res.json(report);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Periods
router.get('/periods', authMiddleware, async (req, res) => {
  try {
    const periods = await periodService.getAllPeriods();
    res.json(periods);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/periods', authMiddleware, async (req, res) => {
  try {
    const { name, startDate, endDate } = req.body;
    const period = await periodService.createPeriod(name, new Date(startDate), new Date(endDate));
    res.status(201).json(period);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/periods/:id/toggle-lock', authMiddleware, async (req, res) => {
  try {
    const period = await periodService.toggleLock(req.params.id);
    res.json(period);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
