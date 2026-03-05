import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../../../infrastructure/database/prisma';
import { authMiddleware } from '../middlewares/authMiddleware';
import { checkRole, checkPermission } from '../middlewares/roleMiddleware';
import { AccountService } from '../../../application/services/AccountService';
import { PeriodService } from '../../../application/services/PeriodService';
import { ExchangeReportService } from '../../../application/services/ExchangeReportService';

const router = Router();
const accountService = new AccountService();
const periodService = new PeriodService();
const exchangeService = new ExchangeReportService();

// ─── Auth ────────────────────────────────────────────────────────────────────
router.post('/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await prisma.user.findUnique({
      where: { username },
      include: { role: true }
    });

    if (!user) {
      return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role?.name || 'GUEST' },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '7d' }
    );

    res.json({ token, user: { id: user.id, name: user.name, username: user.username, role: user.role?.name || 'GUEST' } });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ─── Audit Logs ──────────────────────────────────────────────────────────────
router.get('/audit-logs', authMiddleware, checkPermission(['AUDIT_VIEW']), async (req, res) => {
  try {
    const logs = await prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100, // Fetch the latest 100 logs
      include: {
        user: { select: { name: true, username: true } }
      }
    });

    const formattedLogs = logs.map(log => ({
      id: log.id,
      user: log.user?.name || log.user?.username || 'النظام',
      action: log.action,
      entity: log.entity,
      entityId: log.entityId,
      date: new Date(log.createdAt).toLocaleString('en-GB', { hour12: false }),
      details: log.details || '-'
    }));

    res.json(formattedLogs);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/audit-logs/bulk-delete', authMiddleware, checkRole(['ADMIN']), async (req: any, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids)) {
      return res.status(400).json({ error: 'مصفوفة المعرفات مطلوبة' });
    }

    // Check if user is ADMIN if needed (req.user.role === 'ADMIN')
    await prisma.auditLog.deleteMany({
      where: { id: { in: ids } }
    });

    res.status(204).end();
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/audit-logs/:id', authMiddleware, checkRole(['ADMIN']), async (req: any, res) => {
  try {
    // Check if user is ADMIN if needed (req.user.role === 'ADMIN')
    await prisma.auditLog.delete({
      where: { id: req.params.id }
    });
    res.status(204).end();
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ─── User Management ─────────────────────────────────────────────────────────

// Get all users
router.get('/users', authMiddleware, checkPermission(['USERS_VIEW']), async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, username: true, name: true, roleId: true, role: true }
    });
    res.json(users);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create user
router.post('/users', authMiddleware, checkPermission(['USERS_CREATE']), async (req, res) => {
  try {
    const { username, password, name, roleId } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { username, password: hashedPassword, name, roleId }
    });
    const { password: _, ...userWithoutPassword } = user as any;
    res.status(201).json(userWithoutPassword);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Update user
router.put('/users/:id', authMiddleware, checkPermission(['USERS_EDIT']), async (req, res) => {
  try {
    const { username, name, roleId, password } = req.body;
    const updateData: any = { username, name, roleId };
    if (password) {
      updateData.password = await bcrypt.hash(password, 10);
    }

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
router.delete('/users/:id', authMiddleware, checkPermission(['USERS_DELETE']), async (req, res) => {
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
      include: {
        role: {
          include: {
            permissions: { include: { permission: true } }
          }
        }
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      id: user.id,
      name: user.name,
      username: user.username,
      role: user.role?.name || 'GUEST',
      permissions: user.role?.permissions.map(p => p.permission.code) || []
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ─── Roles & Permissions ─────────────────────────────────────────────────────

// Get all roles
router.get('/roles', authMiddleware, checkPermission(['ROLES_VIEW']), async (req, res) => {
  try {
    const roles = await prisma.role.findMany({
      include: {
        permissions: { include: { permission: true } },
        _count: { select: { users: true } }
      }
    });
    res.json(roles);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get all permissions
router.get('/permissions', authMiddleware, checkPermission(['ROLES_VIEW']), async (req, res) => {
  try {
    const perms = await prisma.permission.findMany({
      orderBy: [
        { category: 'asc' },
        { name: 'asc' }
      ]
    });
    res.json(perms);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create permission
router.post('/permissions', authMiddleware, checkPermission(['ROLES_MANAGE']), async (req, res) => {
  try {
    const { code, name, category, description } = req.body;
    const perm = await prisma.permission.create({
      data: { code, name, category, description }
    });
    res.status(201).json(perm);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Update permission
router.put('/permissions/:id', authMiddleware, checkPermission(['ROLES_MANAGE']), async (req, res) => {
  try {
    const { code, name, category, description } = req.body;
    const perm = await prisma.permission.update({
      where: { id: req.params.id },
      data: { code, name, category, description }
    });
    res.json(perm);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Delete permission
router.delete('/permissions/:id', authMiddleware, checkPermission(['ROLES_MANAGE']), async (req, res) => {
  try {
    await prisma.permission.delete({
      where: { id: req.params.id }
    });
    res.status(204).send();
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Create role
router.post('/roles', authMiddleware, checkPermission(['ROLES_MANAGE']), async (req, res) => {
  try {
    const { name, description, permissionIds } = req.body;
    const role = await prisma.role.create({
      data: {
        name,
        description,
        permissions: {
          create: (permissionIds || []).map((id: string) => ({
            permissionId: id
          }))
        }
      },
      include: { permissions: { include: { permission: true } } }
    });
    res.status(201).json(role);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Update role
router.put('/roles/:id', authMiddleware, checkPermission(['ROLES_MANAGE']), async (req, res) => {
  try {
    const { name, description, permissionIds } = req.body;

    // Use transaction to sync permissions
    const role = await prisma.$transaction(async (tx) => {
      // 1. Delete old links
      await tx.rolePermission.deleteMany({ where: { roleId: req.params.id } });

      // 2. Update role and create new links
      return tx.role.update({
        where: { id: req.params.id },
        data: {
          name,
          description,
          permissions: {
            create: (permissionIds || []).map((id: string) => ({
              permissionId: id
            }))
          }
        },
        include: { permissions: { include: { permission: true } } }
      });
    });

    res.json(role);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Delete role
router.delete('/roles/:id', authMiddleware, checkPermission(['ROLES_MANAGE']), async (req, res) => {
  try {
    // Check if role has users
    const usersCount = await prisma.user.count({ where: { roleId: req.params.id } });
    if (usersCount > 0) {
      return res.status(400).json({ error: 'لا يمكن حذف الدور لوجود مستخدمين مرتبطين به' });
    }

    await prisma.role.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Get all currencies
router.get('/currencies', authMiddleware, checkPermission(['CURRENCIES_VIEW']), async (req, res) => {
  try {
    const currencies = await prisma.currency.findMany();
    res.json(currencies);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get all accounts
router.get('/accounts', authMiddleware, checkPermission(['ACCOUNTS_VIEW']), async (req, res) => {
  try {
    const accounts = await accountService.getAccountsWithBalances();
    res.json(accounts);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create account
router.post('/accounts', authMiddleware, checkPermission(['ACCOUNTS_CREATE']), async (req, res) => {
  try {
    const account = await accountService.createAccount(req.body);
    res.status(201).json(account);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update account
router.put('/accounts/:id', authMiddleware, checkPermission(['ACCOUNTS_EDIT']), async (req, res) => {
  try {
    const account = await accountService.updateAccount(req.params.id, req.body);
    res.json(account);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Delete account
router.delete('/accounts/:id', authMiddleware, checkPermission(['ACCOUNTS_DELETE']), async (req, res) => {
  try {
    const result = await accountService.deleteAccount(req.params.id);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get all branches
router.get('/branches', authMiddleware, checkPermission(['ENTITIES_VIEW']), async (req, res) => {
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
router.post('/branches', authMiddleware, checkPermission(['ENTITIES_CREATE']), async (req, res) => {
  try {
    const branch = await prisma.branch.create({ data: req.body });
    res.status(201).json(branch);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update branch
router.put('/branches/:id', authMiddleware, checkPermission(['ENTITIES_EDIT']), async (req, res) => {
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
router.delete('/branches/:id', authMiddleware, checkPermission(['ENTITIES_DELETE']), async (req, res) => {
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
router.post('/currencies', authMiddleware, checkPermission(['CURRENCIES_MANAGE']), async (req, res) => {
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

router.put('/currencies/:id', authMiddleware, checkPermission(['CURRENCIES_MANAGE']), async (req, res) => {
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

router.delete('/currencies/:id', authMiddleware, checkPermission(['CURRENCIES_MANAGE']), async (req, res) => {
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
router.get('/periods', authMiddleware, checkPermission(['PERIODS_VIEW']), async (req, res) => {
  try {
    const periods = await periodService.getAllPeriods();
    res.json(periods);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/periods', authMiddleware, checkPermission(['PERIODS_MANAGE']), async (req, res) => {
  try {
    const { name, startDate, endDate } = req.body;
    const period = await periodService.createPeriod(name, new Date(startDate), new Date(endDate));
    res.status(201).json(period);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/periods/:id/toggle-lock', authMiddleware, checkPermission(['PERIODS_MANAGE']), async (req, res) => {
  try {
    const period = await periodService.toggleLock(req.params.id);
    res.json(period);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ─── BACKUP — Export all data as JSON ────────────────────────────────────────
router.get('/backup', authMiddleware, checkPermission(['DB_BACKUP']), async (req, res) => {
  try {
    const [
      currencies, branches, accounts, periods, journalEntries, journalLines, users,
      roles, permissions, rolePermissions, entities, members, memberSubscriptions,
      attachments, subscriptionCollections, subscriptionCollectionItems, importReports
    ] = await Promise.all([
      prisma.currency.findMany(),
      prisma.branch.findMany(),
      prisma.account.findMany(),
      prisma.period.findMany(),
      prisma.journalEntry.findMany(),
      prisma.journalLine.findMany(),
      prisma.user.findMany({ select: { id: true, username: true, name: true, roleId: true } }),
      prisma.role.findMany(),
      prisma.permission.findMany(),
      prisma.rolePermission.findMany(),
      prisma.entity.findMany(),
      prisma.member.findMany(),
      prisma.memberSubscription.findMany(),
      prisma.attachment.findMany(),
      prisma.subscriptionCollection.findMany(),
      prisma.subscriptionCollectionItem.findMany(),
      prisma.importReport.findMany(),
    ]);

    const backup = {
      version: '1.1',
      exportedAt: new Date().toISOString(),
      data: {
        currencies, branches, accounts, periods, journalEntries, journalLines, users,
        roles, permissions, rolePermissions, entities, members, memberSubscriptions,
        attachments, subscriptionCollections, subscriptionCollectionItems, importReports
      }
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="family-fund-backup-${new Date().toISOString().split('T')[0]}.json"`);
    res.json(backup);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ─── RESTORE — Import JSON backup ────────────────────────────────────────────
router.post('/restore', authMiddleware, checkPermission(['DB_BACKUP']), async (req, res) => {
  try {
    const { data } = req.body;
    if (!data || !data.currencies) {
      return res.status(400).json({ error: 'ملف النسخ الاحتياطي غير صالح أو تالف.' });
    }

    // Clear in FK-safe order (leaves to roots)
    await prisma.subscriptionCollectionItem.deleteMany({});
    await prisma.subscriptionCollection.deleteMany({});
    await prisma.memberSubscription.deleteMany({});
    await prisma.member.deleteMany({});
    await prisma.entity.deleteMany({});
    await prisma.attachment.deleteMany({});
    await prisma.journalLine.deleteMany({});
    await prisma.journalEntry.deleteMany({});
    await prisma.auditLog.deleteMany({});
    await prisma.importReport.deleteMany({});
    await prisma.account.deleteMany({});
    await prisma.period.deleteMany({});
    await prisma.currencyRateHistory.deleteMany({});
    await prisma.branch.deleteMany({});
    await prisma.currency.deleteMany({});

    // Re-insert in dependency order
    if (data.currencies?.length) await prisma.currency.createMany({ data: data.currencies });
    if (data.branches?.length) await prisma.branch.createMany({ data: data.branches });

    // Entities (must be after branches/currencies)
    if (data.entities?.length) await prisma.entity.createMany({ data: data.entities });

    // Members (must be after entities)
    if (data.members?.length) {
      // Members can have hierarchy (managerId), so we use the same pass-based logic as accounts
      const inserted = new Set<string>();
      const remaining = [...data.members];
      let passes = 0;
      while (remaining.length > 0 && passes < 30) {
        passes++;
        for (let i = remaining.length - 1; i >= 0; i--) {
          const item = remaining[i];
          if (!item.managerId || inserted.has(item.managerId)) {
            await prisma.member.create({ data: item });
            inserted.add(item.id);
            remaining.splice(i, 1);
          }
        }
      }
    }

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
    if (data.memberSubscriptions?.length) await prisma.memberSubscription.createMany({ data: data.memberSubscriptions });
    if (data.attachments?.length) await prisma.attachment.createMany({ data: data.attachments });

    // Subscription Collections
    if (data.subscriptionCollections?.length) await prisma.subscriptionCollection.createMany({ data: data.subscriptionCollections });
    if (data.subscriptionCollectionItems?.length) await prisma.subscriptionCollectionItem.createMany({ data: data.subscriptionCollectionItems });

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
router.delete('/reset-all', authMiddleware, checkPermission(['DB_RESET']), async (req, res) => {
  try {
    // Clear in FK-safe order (leaves to roots)
    await prisma.subscriptionCollectionItem.deleteMany({});
    await prisma.subscriptionCollection.deleteMany({});
    await prisma.memberSubscription.deleteMany({});
    await prisma.member.deleteMany({});
    await prisma.entity.deleteMany({});
    await prisma.attachment.deleteMany({});
    await prisma.journalLine.deleteMany({});
    await prisma.journalEntry.deleteMany({});
    await prisma.auditLog.deleteMany({});
    await prisma.importReport.deleteMany({});
    await prisma.account.deleteMany({});
    await prisma.period.deleteMany({});
    await prisma.currencyRateHistory.deleteMany({});
    await prisma.branch.deleteMany({});
    await prisma.currency.deleteMany({});

    // 8. Delete non-ADMIN users (keep the admin account)
    await prisma.user.deleteMany({
      where: { role: { name: { not: 'ADMIN' } } }
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
