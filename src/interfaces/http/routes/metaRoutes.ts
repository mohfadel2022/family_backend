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

// ─── User Management ─────────────────────────────────────────────────────────

// Get all users
router.get('/users', authMiddleware, async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, username: true, name: true, role: true }
    });
    res.json(users);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create user
router.post('/users', authMiddleware, async (req, res) => {
  try {
    const { username, password, name, role } = req.body;
    const user = await prisma.user.create({
      data: { username, password, name, role }
    });
    const { password: _, ...userWithoutPassword } = user as any;
    res.status(201).json(userWithoutPassword);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Update user
router.put('/users/:id', authMiddleware, async (req, res) => {
  try {
    const { username, name, role, password } = req.body;
    const updateData: any = { username, name, role };
    if (password) updateData.password = password;

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: updateData
    });
    const { password: _, ...userWithoutPassword } = user as any;
    res.json(userWithoutPassword);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Delete user
router.delete('/users/:id', authMiddleware, async (req, res) => {
  try {
    await prisma.user.delete({ where: { id: req.params.id } });
    res.json({ message: 'User deleted' });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});



// Get current user
router.get('/me', authMiddleware, async (req: any, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, name: true, username: true, role: true }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

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
    const accounts = await accountService.getAccountsWithBalances();
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
      include: { currency: true, users: { select: { id: true, name: true } } }
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
        data: { isBase: false, exchangeRate: 1 } // Though existing base should already be 1
      });
      req.body.exchangeRate = 1;
    }

    const currency = await prisma.currency.create({
      data: {
        ...req.body,
        history: {
          create: {
            rate: req.body.exchangeRate || 1,
            date: new Date()
          }
        }
      }
    });
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
      req.body.exchangeRate = 1;
    }

    const oldCurrency = await prisma.currency.findUnique({ where: { id: req.params.id } });

    const currency = await prisma.currency.update({
      where: { id: req.params.id },
      data: req.body
    });

    if (oldCurrency && Number(oldCurrency.exchangeRate) !== Number(req.body.exchangeRate)) {
      await prisma.currencyRateHistory.create({
        data: {
          currencyId: currency.id,
          rate: req.body.exchangeRate,
          date: new Date()
        }
      });
    }

    res.json(currency);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get rate at specific date
router.get('/currencies/:id/history', authMiddleware, async (req, res) => {
  try {
    const history = await prisma.currencyRateHistory.findMany({
      where: { currencyId: req.params.id },
      orderBy: { date: 'desc' }
    });
    res.json(history);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/currencies/history/:historyId', authMiddleware, async (req, res) => {
  try {
    const { rate, date } = req.body;
    const history = await prisma.currencyRateHistory.update({
      where: { id: req.params.historyId },
      data: {
        rate: Number(rate),
        date: date ? new Date(date) : undefined
      }
    });
    res.json(history);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/currencies/history/:historyId', authMiddleware, async (req, res) => {
  try {
    await prisma.currencyRateHistory.delete({
      where: { id: req.params.historyId }
    });
    res.status(204).end();
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/currencies/:id/rate-at', authMiddleware, async (req, res) => {
  try {
    const { date } = req.query;
    const targetDate = date ? new Date(date as string) : new Date();

    // Find the newest history record that is <= targetDate
    const rateHistory = await prisma.currencyRateHistory.findFirst({
      where: {
        currencyId: req.params.id,
        date: { lte: targetDate }
      },
      orderBy: { date: 'desc' }
    });

    if (rateHistory) {
      return res.json({ rate: rateHistory.rate });
    }

    // Fallback to current rate if no history matches
    const currency = await prisma.currency.findUnique({ where: { id: req.params.id } });
    res.json({ rate: currency?.exchangeRate || 1 });
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

    // First delete history
    await prisma.currencyRateHistory.deleteMany({ where: { currencyId: req.params.id } });

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

// ─── BACKUP — Export all data as JSON ────────────────────────────────────────
router.get('/backup', authMiddleware, async (req, res) => {
  try {
    const [currencies, branches, accounts, periods, journalEntries, journalLines, users] = await Promise.all([
      prisma.currency.findMany(),
      prisma.branch.findMany(),
      prisma.account.findMany(),
      prisma.period.findMany(),
      prisma.journalEntry.findMany(),
      prisma.journalLine.findMany(),
      prisma.user.findMany({ select: { id: true, username: true, name: true, role: true } }),
    ]);

    const backup = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      data: { currencies, branches, accounts, periods, journalEntries, journalLines, users }
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="family-fund-backup-${new Date().toISOString().split('T')[0]}.json"`);
    res.json(backup);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ─── RESTORE — Import JSON backup ────────────────────────────────────────────
router.post('/restore', authMiddleware, async (req, res) => {
  try {
    const { data } = req.body;
    if (!data || !data.currencies) {
      return res.status(400).json({ error: 'ملف النسخ الاحتياطي غير صالح أو تالف.' });
    }

    // Clear in FK-safe order
    await prisma.journalLine.deleteMany({});
    await prisma.journalEntry.deleteMany({});
    await prisma.auditLog.deleteMany({});
    await prisma.account.deleteMany({});
    await prisma.period.deleteMany({});
    await prisma.branch.deleteMany({});
    await prisma.currency.deleteMany({});

    // Re-insert in dependency order
    if (data.currencies?.length) await prisma.currency.createMany({ data: data.currencies });
    if (data.branches?.length) await prisma.branch.createMany({ data: data.branches });

    // Accounts: topological sort — parents before children
    if (data.accounts?.length) {
      const inserted = new Set<string>();
      const remaining = [...data.accounts];
      let passes = 0;
      while (remaining.length > 0 && passes < 30) {
        passes++;
        for (let i = remaining.length - 1; i >= 0; i--) {
          const acc = remaining[i];
          if (!acc.parentId || inserted.has(acc.parentId)) {
            await prisma.account.create({ data: acc });
            inserted.add(acc.id);
            remaining.splice(i, 1);
          }
        }
      }
    }

    if (data.periods?.length) await prisma.period.createMany({ data: data.periods });
    if (data.journalEntries?.length) await prisma.journalEntry.createMany({ data: data.journalEntries });
    if (data.journalLines?.length) await prisma.journalLine.createMany({ data: data.journalLines });

    res.json({
      success: true,
      message: 'تم استعادة النسخة الاحتياطية بنجاح.',
      stats: {
        currencies: data.currencies?.length || 0,
        branches: data.branches?.length || 0,
        accounts: data.accounts?.length || 0,
        periods: data.periods?.length || 0,
        journalEntries: data.journalEntries?.length || 0,
        journalLines: data.journalLines?.length || 0,
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ─── RESET ALL DATA ──────────────────────────────────────────────────────────
// Deletes ALL financial data AND non-ADMIN users, in FK-safe order.
// The ADMIN user is always preserved.
router.delete('/reset-all', authMiddleware, async (req, res) => {
  try {
    // 1. Delete all journal lines first (no FK dependencies)
    await prisma.journalLine.deleteMany({});

    // 2. Delete all journal entries (FK: branch, user)
    await prisma.journalEntry.deleteMany({});

    // 3. Delete all audit logs (FK: user) — needed before deleting non-admin users
    await prisma.auditLog.deleteMany({});

    // 4. Delete all accounts (FK: branch, currency)
    await prisma.account.deleteMany({});

    // 5. Delete all accounting periods
    await prisma.period.deleteMany({});

    // 6. Delete all branches (FK: currency)
    await prisma.branch.deleteMany({});

    // 7. Delete all currencies
    await prisma.currency.deleteMany({});

    // 8. Delete non-ADMIN users (keep the admin account)
    await prisma.user.deleteMany({
      where: { role: { not: 'ADMIN' } }
    });

    res.json({
      success: true,
      message: 'تم مسح جميع البيانات والمستخدمين (ما عدا المدير) بنجاح. التطبيق جاهز للبداية من جديد.'
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
