import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../../../infrastructure/database/prisma';
import { authMiddleware } from '../middlewares/authMiddleware';
import fs from 'fs';
import path from 'path';
import { checkRole, checkPermission } from '../middlewares/roleMiddleware';
import { AccountService } from '../../../application/services/AccountService';
import { PeriodService } from '../../../application/services/PeriodService';
import { ExchangeReportService } from '../../../application/services/ExchangeReportService';
import { emailService } from '../../../application/services/EmailService';
import crypto from 'crypto';

const router = Router();
const accountService = new AccountService();
const periodService = new PeriodService();
const exchangeService = new ExchangeReportService();

// Helper for password strength validation
const isPasswordStrong = (password: string): boolean => {
  const minLength = 8;
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSymbol = /[^A-Za-z0-9]/.test(password);
  return password.length >= minLength && hasUpper && hasLower && hasNumber && hasSymbol;
};

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

    // Audit Logging for Login
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'LOGIN',
        entity: 'User',
        entityId: user.id,
        details: { username: user.username, ip: req.ip }
      }
    });

    res.json({ token, user: { id: user.id, name: user.name, username: user.username, email: user.email, role: user.role?.name || 'GUEST' } });
  } catch (error: any) {
    const errorMsg = error.message || "Internal Server Error";
    console.error("META ROUTE ERROR:", error);
    try {
      fs.appendFileSync(path.join(process.cwd(), 'error_log.txt'), `[${new Date().toISOString()}] ${req.method} ${req.url} - ERROR: ${errorMsg}\nSTACK: ${error.stack}\n\n`);
    } catch (logErr) { }
    res.status(500).json({ error: errorMsg });
  }
});

router.post('/auth/forgot-password', async (req, res) => {
  try {
    const { loginId } = req.body;
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { username: loginId },
          { email: loginId }
        ]
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'المستخدم غير موجود' });
    }

    if (!user.email) {
      return res.status(400).json({ code: 'NO_EMAIL', error: 'المستخدم ليس لديه بريد إلكتروني مسجل' });
    }

    // Generate secure token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetExpires = new Date(Date.now() + 3600000); // 1 hour

    await prisma.user.update({
      where: { id: user.id },
      data: { resetToken, resetExpires }
    });

    // Send real email with link
    await emailService.sendPasswordResetEmail(user.email, user.username, resetToken);
    res.json({ message: 'Success', email: user.email });
  } catch (error: any) {
    console.error("Forgot password error:", error);
    res.status(500).json({ error: 'فشل إرسال البريد الإلكتروني. يرجى التحقق من إعدادات SMTP.' });
  }
});

router.get('/auth/verify-token', async (req, res) => {
  try {
    const { token } = req.query;
    console.log(`VerifyToken: Received='${token}'`);
    if (!token) return res.status(400).json({ error: 'الرمز مفقود' });

    const user = await prisma.user.findFirst({
      where: {
        resetToken: String(token),
        resetExpires: { gt: new Date() }
      }
    });

    if (!user) {
      console.log("VerifyToken: Token invalid or expired in DB");
      return res.status(400).json({ error: 'الرمز غير صالح أو انتهت صلاحيته' });
    }

    console.log("VerifyToken: OK for user", user.username);
    res.json({ message: 'Token is valid' });
  } catch (error: any) {
    console.error("VerifyToken ERROR:", error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/auth/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    console.log(`ResetPassword: Received token='${token}'`);

    const user = await prisma.user.findFirst({
      where: {
        resetToken: token,
        resetExpires: { gt: new Date() }
      }
    });

    if (!user) {
      console.log("ResetPassword: User not found with token or token expired");
      return res.status(400).json({ error: 'الرمز غير صالح أو انتهت صلاحيته' });
    }

    if (!isPasswordStrong(newPassword)) {
      return res.status(400).json({ error: 'يجب أن تتكون كلمة المرور من 8 أحرف على الأقل، وتحتوي على حرف كبير وصغير ورقم ورمز خاص' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        resetToken: null,
        resetExpires: null
      }
    });

    res.json({ message: 'Password updated successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ─── Audit Logs ──────────────────────────────────────────────────────────────
router.get('/audit-logs', authMiddleware, checkPermission(['AUDIT_LOGS_VIEW']), async (req, res) => {
  try {
    const { entityId } = req.query;
    const where: any = {};
    if (entityId) {
      where.entityId = entityId;
    }

    const logs = await prisma.auditLog.findMany({
      where,
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
    const errorMsg = error.message || "Internal Server Error";
    console.error("META ROUTE ERROR:", error);
    try {
      fs.appendFileSync(path.join(process.cwd(), 'error_log.txt'), `[${new Date().toISOString()}] ${req.method} ${req.url} - ERROR: ${errorMsg}\nSTACK: ${error.stack}\n\n`);
    } catch (logErr) { }
    res.status(500).json({ error: errorMsg });
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
    const errorMsg = error.message || "Internal Server Error";
    console.error("META ROUTE ERROR:", error);
    try {
      fs.appendFileSync(path.join(process.cwd(), 'error_log.txt'), `[${new Date().toISOString()}] ${req.method} ${req.url} - ERROR: ${errorMsg}\nSTACK: ${error.stack}\n\n`);
    } catch (logErr) { }
    res.status(500).json({ error: errorMsg });
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
    const errorMsg = error.message || "Internal Server Error";
    console.error("META ROUTE ERROR:", error);
    try {
      fs.appendFileSync(path.join(process.cwd(), 'error_log.txt'), `[${new Date().toISOString()}] ${req.method} ${req.url} - ERROR: ${errorMsg}\nSTACK: ${error.stack}\n\n`);
    } catch (logErr) { }
    res.status(500).json({ error: errorMsg });
  }
});

// ─── User Management ─────────────────────────────────────────────────────────

// Get all users
router.get('/users', authMiddleware, checkPermission(['USERS_VIEW']), async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        name: true,
        email: true,
        roleId: true,
        role: true,
        entities: {
          select: {
            id: true,
            name: true,
            code: true
          }
        }
      }
    });
    res.json(users);
  } catch (error: any) {
    const errorMsg = error.message || "Internal Server Error";
    console.error("META ROUTE ERROR:", error);
    try {
      fs.appendFileSync(path.join(process.cwd(), 'error_log.txt'), `[${new Date().toISOString()}] ${req.method} ${req.url} - ERROR: ${errorMsg}\nSTACK: ${error.stack}\n\n`);
    } catch (logErr) { }
    res.status(500).json({ error: errorMsg });
  }
});

// Create user
router.post('/users', authMiddleware, checkPermission(['USERS_CREATE']), async (req, res) => {
  try {
    const { username, password, name, roleId, email } = req.body;

    if (!isPasswordStrong(password)) {
      return res.status(400).json({ error: 'يجب أن تتكون كلمة المرور من 8 أحرف على الأقل، وتحتوي على حرف كبير وصغير ورقم ورمز خاص' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { username, password: hashedPassword, name, roleId, email }
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
    const { username, name, roleId, password, email } = req.body;
    const updateData: any = { username, name, roleId, email };
    if (password) {
      if (!isPasswordStrong(password)) {
        return res.status(400).json({ error: 'يجب أن تتكون كلمة المرور من 8 أحرف على الأقل، وتحتوي على حرف كبير وصغير ورقم ورمز خاص' });
      }
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
      return res.status(401).json({ error: 'User not found' });
    }

    res.json({
      id: user.id,
      name: user.name,
      username: user.username,
      email: user.email,
      role: user.role?.name || 'GUEST',
      permissions: user.role?.permissions
        .filter(p => p.permission)
        .map(p => p.permission.code) || []
    });
  } catch (error: any) {
    const errorMsg = error.message || "Internal Server Error";
    console.error("META ROUTE ERROR:", error);
    try {
      fs.appendFileSync(path.join(process.cwd(), 'error_log.txt'), `[${new Date().toISOString()}] ${req.method} ${req.url} - ERROR: ${errorMsg}\nSTACK: ${error.stack}\n\n`);
    } catch (logErr) { }
    res.status(500).json({ error: errorMsg });
  }
});

// Update own profile
router.put('/me', authMiddleware, async (req: any, res) => {
  try {
    const { name, username } = req.body;

    // Check if username is taken by another user
    if (username) {
      const existing = await prisma.user.findFirst({
        where: {
          username,
          id: { not: req.user.id }
        }
      });
      if (existing) return res.status(400).json({ error: 'اسم المستخدم مستخدم بالفعل' });
    }

    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data: { name, username }
    });

    res.json({ id: updated.id, name: updated.name, username: updated.username });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Update own password
router.put('/me/password', authMiddleware, async (req: any, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    const user = await prisma.user.findUnique({
      where: { id: req.user.id }
    });

    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });

    const isValid = await bcrypt.compare(currentPassword, user.password);
    if (!isValid) return res.status(401).json({ error: 'كلمة المرور الحالية غير صحيحة' });

    if (!isPasswordStrong(newPassword)) {
      return res.status(400).json({ error: 'يجب أن تتكون كلمة المرور من 8 أحرف على الأقل، وتحتوي على حرف كبير وصغير ورقم ورمز خاص' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: req.user.id },
      data: { password: hashedPassword }
    });

    res.json({ success: true, message: 'تم تغيير كلمة المرور بنجاح' });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
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
    const errorMsg = error.message || "Internal Server Error";
    console.error("META ROUTE ERROR:", error);
    try {
      fs.appendFileSync(path.join(process.cwd(), 'error_log.txt'), `[${new Date().toISOString()}] ${req.method} ${req.url} - ERROR: ${errorMsg}\nSTACK: ${error.stack}\n\n`);
    } catch (logErr) { }
    res.status(500).json({ error: errorMsg });
  }
});

// Get all permissions
router.get('/permissions', authMiddleware, checkPermission(['PERMISSIONS_VIEW', 'ROLES_VIEW']), async (req, res) => {
  try {
    const perms = await prisma.permission.findMany({
      orderBy: [
        { category: 'asc' },
        { name: 'asc' }
      ]
    });
    res.json(perms);
  } catch (error: any) {
    const errorMsg = error.message || "Internal Server Error";
    console.error("META ROUTE ERROR:", error);
    try {
      fs.appendFileSync(path.join(process.cwd(), 'error_log.txt'), `[${new Date().toISOString()}] ${req.method} ${req.url} - ERROR: ${errorMsg}\nSTACK: ${error.stack}\n\n`);
    } catch (logErr) { }
    res.status(500).json({ error: errorMsg });
  }
});

// Create permission
router.post('/permissions', authMiddleware, checkPermission(['PERMISSIONS_CREATE']), async (req, res) => {
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
router.put('/permissions/:id', authMiddleware, checkPermission(['PERMISSIONS_EDIT']), async (req, res) => {
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
router.delete('/permissions/:id', authMiddleware, checkPermission(['PERMISSIONS_DELETE']), async (req, res) => {
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
router.post('/roles', authMiddleware, checkPermission(['ROLES_CREATE']), async (req, res) => {
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
router.put('/roles/:id', authMiddleware, checkPermission(['ROLES_EDIT']), async (req, res) => {
  try {
    const { name, description, permissionIds } = req.body;

    // Use transaction to sync permissions
    const role = await prisma.$transaction(async (tx) => {
      // Check if role exists (by ID or Name)
      let roleToUpdate = await tx.role.findUnique({
        where: { id: req.params.id }
      });

      if (!roleToUpdate) {
        roleToUpdate = await tx.role.findUnique({
          where: { name: req.params.id }
        });
      }

      if (!roleToUpdate) {
        throw new Error(`الدور "${req.params.id}" غير موجود`);
      }

      const roleId = roleToUpdate.id;

      // 1. Delete old links
      await tx.rolePermission.deleteMany({ where: { roleId } });

      // 2. Update role and create new links
      return tx.role.update({
        where: { id: roleId },
        data: {
          name,
          description,
          permissions: {
            create: (permissionIds || []).map((pId: string) => ({
              permissionId: pId
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
router.delete('/roles/:id', authMiddleware, checkPermission(['ROLES_DELETE']), async (req, res) => {
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
    const errorMsg = error.message || "Internal Server Error";
    console.error("META ROUTE ERROR:", error);
    try {
      fs.appendFileSync(path.join(process.cwd(), 'error_log.txt'), `[${new Date().toISOString()}] ${req.method} ${req.url} - ERROR: ${errorMsg}\nSTACK: ${error.stack}\n\n`);
    } catch (logErr) { }
    res.status(500).json({ error: errorMsg });
  }
});

// Get all accounts
router.get('/accounts', authMiddleware, checkPermission(['ACCOUNTS_VIEW']), async (req: any, res) => {
  try {
    let branchId = req.query.branchId as string;
    if (req.user.role === 'ENCARGADO') {
      const allowedEntities = await prisma.entity.findMany({ where: { userId: req.user.id } });
      const allowedBranchIds = allowedEntities.map(e => e.branchId);

      if (!branchId && allowedBranchIds.length === 1) {
        branchId = allowedBranchIds[0];
      } else if (branchId && !allowedBranchIds.includes(branchId)) {
        return res.status(403).json({ error: 'ليس لديك صلاحية الوصول لحسابات هذا الفرع' });
      } else if (!branchId && allowedBranchIds.length > 1) {
        branchId = allowedBranchIds[0];
      }
    }
    const accounts = await accountService.getAccountsWithBalances(branchId);
    res.json(accounts);
  } catch (error: any) {
    const errorMsg = error.message || "Internal Server Error";
    console.error("META ROUTE ERROR:", error);
    try {
      fs.appendFileSync(path.join(process.cwd(), 'error_log.txt'), `[${new Date().toISOString()}] ${req.method} ${req.url} - ERROR: ${errorMsg}\nSTACK: ${error.stack}\n\n`);
    } catch (logErr) { }
    res.status(500).json({ error: errorMsg });
  }
});

// Create account
router.post('/accounts', authMiddleware, checkPermission(['ACCOUNTS_CREATE']), async (req: any, res) => {
  try {
    if (req.user.role === 'ENCARGADO') {
      const allowedEntities = await prisma.entity.findMany({ where: { userId: req.user.id } });
      const allowedBranchIds = allowedEntities.map(e => e.branchId);
      if (!allowedBranchIds.includes(req.body.branchId)) {
        return res.status(403).json({ error: 'لا يمكنك إنشاء حساب في هذا الفرع' });
      }
    }
    const { name, code, type, currencyId, branchId, parentId } = req.body;
    const account = await accountService.createAccount({ name, code, type, currencyId, branchId, parentId });
    res.status(201).json(account);
  } catch (error: any) {
    const errorMsg = error.message || "Internal Server Error";
    console.error("META ROUTE ERROR:", error);
    try {
      fs.appendFileSync(path.join(process.cwd(), 'error_log.txt'), `[${new Date().toISOString()}] ${req.method} ${req.url} - ERROR: ${errorMsg}\nSTACK: ${error.stack}\n\n`);
    } catch (logErr) { }
    res.status(500).json({ error: errorMsg });
  }
});

// Update account
router.put('/accounts/:id', authMiddleware, checkPermission(['ACCOUNTS_EDIT']), async (req: any, res) => {
  try {
    if (req.user.role === 'ENCARGADO') {
      const account = await prisma.account.findUnique({ where: { id: req.params.id } });
      const allowedEntities = await prisma.entity.findMany({ where: { userId: req.user.id } });
      const allowedBranchIds = allowedEntities.map(e => e.branchId);
      if (!account || !allowedBranchIds.includes(account.branchId)) {
        return res.status(403).json({ error: 'لا يمكنك تعديل حساب خارج فرعك' });
      }
    }
    const { name, code, type, currencyId, branchId, parentId } = req.body;
    const account = await accountService.updateAccount(req.params.id, { name, code, type, currencyId, branchId, parentId });
    res.json(account);
  } catch (error: any) {
    const errorMsg = error.message || "Internal Server Error";
    console.error("META ROUTE ERROR:", error);
    try {
      fs.appendFileSync(path.join(process.cwd(), 'error_log.txt'), `[${new Date().toISOString()}] ${req.method} ${req.url} - ERROR: ${errorMsg}\nSTACK: ${error.stack}\n\n`);
    } catch (logErr) { }
    res.status(500).json({ error: errorMsg });
  }
});

// Delete account
router.delete('/accounts/:id', authMiddleware, checkPermission(['ACCOUNTS_DELETE']), async (req: any, res) => {
  try {
    if (req.user.role === 'ENCARGADO') {
      const account = await prisma.account.findUnique({ where: { id: req.params.id } });
      const allowedEntities = await prisma.entity.findMany({ where: { userId: req.user.id } });
      const allowedBranchIds = allowedEntities.map(e => e.branchId);
      if (!account || !allowedBranchIds.includes(account.branchId)) {
        return res.status(403).json({ error: 'لا يمكنك حذف حساب خارج فرعك' });
      }
    }
    const result = await accountService.deleteAccount(req.params.id);
    res.json(result);
  } catch (error: any) {
    const errorMsg = error.message || "Internal Server Error";
    console.error("META ROUTE ERROR:", error);
    try {
      fs.appendFileSync(path.join(process.cwd(), 'error_log.txt'), `[${new Date().toISOString()}] ${req.method} ${req.url} - ERROR: ${errorMsg}\nSTACK: ${error.stack}\n\n`);
    } catch (logErr) { }
    res.status(500).json({ error: errorMsg });
  }
});

// Get all branches
router.get('/branches', authMiddleware, checkPermission(['ENTITIES_VIEW']), async (req: any, res) => {
  try {
    const where: any = {};
    if (req.user.role === 'ENCARGADO') {
      where.entities = { some: { userId: req.user.id } };
    }

    const branches = await prisma.branch.findMany({
      where,
      include: { currency: true, users: { select: { id: true, name: true } } }
    });
    res.json(branches);
  } catch (error: any) {
    const errorMsg = error.message || "Internal Server Error";
    console.error("META ROUTE ERROR:", error);
    try {
      fs.appendFileSync(path.join(process.cwd(), 'error_log.txt'), `[${new Date().toISOString()}] ${req.method} ${req.url} - ERROR: ${errorMsg}\nSTACK: ${error.stack}\n\n`);
    } catch (logErr) { }
    res.status(500).json({ error: errorMsg });
  }
});

// Create branch
router.post('/branches', authMiddleware, checkPermission(['ENTITIES_CREATE']), async (req, res) => {
  try {
    const { name, code, currencyId } = req.body;
    const branch = await prisma.branch.create({ data: { name, code, currencyId } });
    res.status(201).json(branch);
  } catch (error: any) {
    const errorMsg = error.message || "Internal Server Error";
    console.error("META ROUTE ERROR:", error);
    try {
      fs.appendFileSync(path.join(process.cwd(), 'error_log.txt'), `[${new Date().toISOString()}] ${req.method} ${req.url} - ERROR: ${errorMsg}\nSTACK: ${error.stack}\n\n`);
    } catch (logErr) { }
    res.status(500).json({ error: errorMsg });
  }
});

// Update branch
router.put('/branches/:id', authMiddleware, checkPermission(['ENTITIES_EDIT']), async (req, res) => {
  try {
    const { name, code, currencyId } = req.body;
    const branch = await prisma.branch.update({
      where: { id: req.params.id },
      data: { name, code, currencyId }
    });
    res.json(branch);
  } catch (error: any) {
    const errorMsg = error.message || "Internal Server Error";
    console.error("META ROUTE ERROR:", error);
    try {
      fs.appendFileSync(path.join(process.cwd(), 'error_log.txt'), `[${new Date().toISOString()}] ${req.method} ${req.url} - ERROR: ${errorMsg}\nSTACK: ${error.stack}\n\n`);
    } catch (logErr) { }
    res.status(500).json({ error: errorMsg });
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
    const errorMsg = error.message || "Internal Server Error";
    console.error("META ROUTE ERROR:", error);
    try {
      fs.appendFileSync(path.join(process.cwd(), 'error_log.txt'), `[${new Date().toISOString()}] ${req.method} ${req.url} - ERROR: ${errorMsg}\nSTACK: ${error.stack}\n\n`);
    } catch (logErr) { }
    res.status(500).json({ error: errorMsg });
  }
});

// Currencies CRUD
router.post('/currencies', authMiddleware, checkPermission(['CURRENCIES_CREATE']), async (req, res) => {
  try {
    const { name, code, symbol, exchangeRate, isBase } = req.body;

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
        name: req.body.name,
        code: req.body.code,
        symbol: req.body.symbol,
        exchangeRate: req.body.exchangeRate,
        isBase: req.body.isBase,
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
    const errorMsg = error.message || "Internal Server Error";
    console.error("META ROUTE ERROR:", error);
    try {
      fs.appendFileSync(path.join(process.cwd(), 'error_log.txt'), `[${new Date().toISOString()}] ${req.method} ${req.url} - ERROR: ${errorMsg}\nSTACK: ${error.stack}\n\n`);
    } catch (logErr) { }
    res.status(500).json({ error: errorMsg });
  }
});

router.put('/currencies/:id', authMiddleware, checkPermission(['CURRENCIES_EDIT']), async (req, res) => {
  try {
    const { name, code, symbol, exchangeRate, isBase } = req.body;

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
      data: { name, code, symbol, exchangeRate, isBase }
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
    const errorMsg = error.message || "Internal Server Error";
    console.error("META ROUTE ERROR:", error);
    try {
      fs.appendFileSync(path.join(process.cwd(), 'error_log.txt'), `[${new Date().toISOString()}] ${req.method} ${req.url} - ERROR: ${errorMsg}\nSTACK: ${error.stack}\n\n`);
    } catch (logErr) { }
    res.status(500).json({ error: errorMsg });
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
    const errorMsg = error.message || "Internal Server Error";
    console.error("META ROUTE ERROR:", error);
    try {
      fs.appendFileSync(path.join(process.cwd(), 'error_log.txt'), `[${new Date().toISOString()}] ${req.method} ${req.url} - ERROR: ${errorMsg}\nSTACK: ${error.stack}\n\n`);
    } catch (logErr) { }
    res.status(500).json({ error: errorMsg });
  }
});

router.put('/currencies/history/:historyId', authMiddleware, checkPermission(['CURRENCIES_EDIT']), async (req, res) => {
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
    const errorMsg = error.message || "Internal Server Error";
    console.error("META ROUTE ERROR:", error);
    try {
      fs.appendFileSync(path.join(process.cwd(), 'error_log.txt'), `[${new Date().toISOString()}] ${req.method} ${req.url} - ERROR: ${errorMsg}\nSTACK: ${error.stack}\n\n`);
    } catch (logErr) { }
    res.status(500).json({ error: errorMsg });
  }
});

router.delete('/currencies/history/:historyId', authMiddleware, checkPermission(['CURRENCIES_EDIT']), async (req, res) => {
  try {
    await prisma.currencyRateHistory.delete({
      where: { id: req.params.historyId }
    });
    res.status(204).end();
  } catch (error: any) {
    const errorMsg = error.message || "Internal Server Error";
    console.error("META ROUTE ERROR:", error);
    try {
      fs.appendFileSync(path.join(process.cwd(), 'error_log.txt'), `[${new Date().toISOString()}] ${req.method} ${req.url} - ERROR: ${errorMsg}\nSTACK: ${error.stack}\n\n`);
    } catch (logErr) { }
    res.status(500).json({ error: errorMsg });
  }
});

router.get('/currencies/audit', authMiddleware, async (req, res) => {
  try {
    const threshold = Number(req.query.threshold) || 0.05; // 0.05% default
    
    // 1. Fetch all NON-base currency journal lines from POSTED vouchers
    const lines = await prisma.journalLine.findMany({
      where: {
        currency: { isBase: false },
        journalEntry: { status: 'POSTED' }
      },
      include: {
        journalEntry: { select: { id: true, entryNumber: true, date: true, type: true } },
        currency: { select: { id: true, code: true } },
        account: { select: { name: true, code: true } }
      }
    });

    // 2. Fetch all historical rates once (Optimization to avoid N+1)
    const allHistory = await prisma.currencyRateHistory.findMany({
      orderBy: { date: 'desc' }
    });

    // Group history by currency for faster lookup
    const historyByCurrency: Record<string, any[]> = {};
    for (const h of allHistory) {
      if (!historyByCurrency[h.currencyId]) {
        historyByCurrency[h.currencyId] = [];
      }
      historyByCurrency[h.currencyId].push(h);
    }

    const anomalies = [];

    // 3. Identify discrepancies with refined date logic
    for (const line of lines) {
      const currencyId = line.currencyId;
      const history = historyByCurrency[currencyId] || [];
      
      // End-of-day logic: find newest rate that is <= end of the voucher's day
      // This is because accounting rates are typically daily, 
      // and any rate entered "on the same day" as the voucher should qualify.
      const voucherDate = new Date(line.journalEntry.date);
      const endOfVoucherDay = new Date(
        voucherDate.getFullYear(), 
        voucherDate.getMonth(), 
        voucherDate.getDate(), 
        23, 59, 59, 999
      );

      const historicalRate = history.find(h => new Date(h.date) <= endOfVoucherDay);

      if (historicalRate) {
        const recorded = Number(line.exchangeRate);
        const expected = Number(historicalRate.rate);
        
        // Calculate difference percentage
        const diffPercent = (Math.abs(recorded - expected) / expected) * 100;

        if (diffPercent > threshold) {
          anomalies.push({
            id: line.id,
            journalEntryId: line.journalEntry.id,
            journalEntryNumber: line.journalEntry.entryNumber,
            type: line.journalEntry.type,
            date: line.journalEntry.date,
            accountName: line.account.name,
            accountCode: line.account.code,
            currencyCode: line.currency.code,
            recordedRate: recorded,
            expectedRate: expected,
            diffPercent: Number(diffPercent.toFixed(2))
          });
        }
      }
    }

    res.json(anomalies);
  } catch (error: any) {
    const errorMsg = error.message || "Internal Server Error";
    console.error("CURRENCY AUDIT ERROR:", error);
    res.status(500).json({ error: errorMsg });
  }
});

router.get('/currencies/:id/rate-at', authMiddleware, async (req, res) => {
  try {
    const { date } = req.query;
    let targetDate = date ? new Date(date as string) : new Date();
    // End of day logic: set to 23:59:59 to capture any rate 
    // defined on the same day as the voucher.
    targetDate.setHours(23, 59, 59, 999);

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
    const errorMsg = error.message || "Internal Server Error";
    console.error("META ROUTE ERROR:", error);
    try {
      fs.appendFileSync(path.join(process.cwd(), 'error_log.txt'), `[${new Date().toISOString()}] ${req.method} ${req.url} - ERROR: ${errorMsg}\nSTACK: ${error.stack}\n\n`);
    } catch (logErr) { }
    res.status(500).json({ error: errorMsg });
  }
});

router.delete('/currencies/:id', authMiddleware, checkPermission(['CURRENCIES_DELETE']), async (req, res) => {
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
    const errorMsg = error.message || "Internal Server Error";
    console.error("META ROUTE ERROR:", error);
    try {
      fs.appendFileSync(path.join(process.cwd(), 'error_log.txt'), `[${new Date().toISOString()}] ${req.method} ${req.url} - ERROR: ${errorMsg}\nSTACK: ${error.stack}\n\n`);
    } catch (logErr) { }
    res.status(500).json({ error: errorMsg });
  }
});

// Reports
router.get('/reports/trial-balance', authMiddleware, checkPermission(['REPORTS_TRIAL_BALANCE', 'REPORTS_TRIAL_BALANCE_VIEW']), async (req: any, res) => {
  try {
    let branchId = req.query.branchId as string;

    if (req.user.role === 'ENCARGADO') {
      const allowedBranches = await prisma.entity.findMany({
        where: { userId: req.user.id },
        select: { branchId: true }
      });
      const allowedIds = allowedBranches.map(e => e.branchId);

      if (!branchId && allowedIds.length === 1) {
        branchId = allowedIds[0];
      } else if (branchId && !allowedIds.includes(branchId)) {
        return res.status(403).json({ error: 'ليس لديك صلاحية الوصول لتقارير هذا الفرع' });
      } else if (!branchId) {
        return res.status(400).json({ error: 'يجب تحديد الفرع' });
      }
    }

    const report = await accountService.getTrialBalance(branchId);
    res.json(report);
  } catch (error: any) {
    const errorMsg = error.message || "Internal Server Error";
    console.error("META ROUTE ERROR:", error);
    try {
      fs.appendFileSync(path.join(process.cwd(), 'error_log.txt'), `[${new Date().toISOString()}] ${req.method} ${req.url} - ERROR: ${errorMsg}\nSTACK: ${error.stack}\n\n`);
    } catch (logErr) { }
    res.status(500).json({ error: errorMsg });
  }
});

router.get('/reports/income-statement', authMiddleware, checkPermission(['REPORTS_INCOME_STATEMENT', 'REPORTS_INCOME_STATEMENT_VIEW', 'REPORTS_BRANCH_REVENUE_VIEW', 'reportes_branch_revenue_view', 'REPORTS_BRANCH_EXPENSE_VIEW', 'reportes_branch_expense_view']), async (req: any, res) => {
  try {
    let branchId = req.query.branchId as string;
    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;

    if (req.user.role === 'ENCARGADO') {
      const allowedBranches = await prisma.entity.findMany({
        where: { userId: req.user.id },
        select: { branchId: true }
      });
      const allowedIds = allowedBranches.map(e => e.branchId);

      if (!branchId && allowedIds.length === 1) {
        branchId = allowedIds[0];
      } else if (branchId && !allowedIds.includes(branchId)) {
        return res.status(403).json({ error: 'ليس لديك صلاحية الوصول لتقارير هذا الفرع' });
      } else if (!branchId) {
        return res.status(400).json({ error: 'يجب تحديد الفرع' });
      }
    }

    const report = await accountService.getIncomeStatement(branchId, startDate, endDate);
    res.json(report);
  } catch (error: any) {
    const errorMsg = error.message || "Internal Server Error";
    console.error("META ROUTE ERROR:", error);
    try {
      fs.appendFileSync(path.join(process.cwd(), 'error_log.txt'), `[${new Date().toISOString()}] ${req.method} ${req.url} - ERROR: ${errorMsg}\nSTACK: ${error.stack}\n\n`);
    } catch (logErr) { }
    res.status(500).json({ error: errorMsg });
  }
});

router.get('/reports/account-statement', authMiddleware, checkPermission(['REPORTS_ACCOUNT_STATEMENT', 'REPORTS_ACCOUNT_STATEMENT_VIEW']), async (req: any, res) => {
  try {
    const accountId = req.query.accountId as string;
    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;

    if (!accountId) return res.status(400).json({ error: 'accountId is required' });

    // For ENCARGADO, we might want to ensure they only view statements for accounts in their branch
    if (req.user.role === 'ENCARGADO') {
      const account = await prisma.account.findUnique({ where: { id: accountId } });
      const allowedBranches = await prisma.entity.findMany({
        where: { userId: req.user.id },
        select: { branchId: true }
      });
      const allowedIds = allowedBranches.map(e => e.branchId);
      if (account && !allowedIds.includes(account.branchId)) {
        return res.status(403).json({ error: 'ليس لديك صلاحية الوصول لكشف هذا الحساب' });
      }
    }

    const report = await accountService.getAccountStatement(accountId, startDate, endDate);
    res.json(report);
  } catch (error: any) {
    const errorMsg = error.message || "Internal Server Error";
    console.error("META ROUTE ERROR:", error);
    try {
      fs.appendFileSync(path.join(process.cwd(), 'error_log.txt'), `[${new Date().toISOString()}] ${req.method} ${req.url} - ERROR: ${errorMsg}\nSTACK: ${error.stack}\n\n`);
    } catch (logErr) { }
    res.status(500).json({ error: errorMsg });
  }
});

router.get('/reports/exchange-report', authMiddleware, checkPermission(['REPORTS_CURRENCY_GAINS_VIEW', 'REPORTS_EXCHANGE', 'REPORTS_EXCHANGE_VIEW', 'REPORTS_CURRENCY_HISTORY_VIEW']), async (req: any, res) => {
  try {
    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
    const report = await exchangeService.getExchangeGainsLosses(startDate, endDate);
    res.json(report);
  } catch (error: any) {
    const errorMsg = error.message || "Internal Server Error";
    console.error("META ROUTE ERROR:", error);
    try {
      fs.appendFileSync(path.join(process.cwd(), 'error_log.txt'), `[${new Date().toISOString()}] ${req.method} ${req.url} - ERROR: ${errorMsg}\nSTACK: ${error.stack}\n\n`);
    } catch (logErr) { }
    res.status(500).json({ error: errorMsg });
  }
});

router.get('/reports/currency-gains', authMiddleware, checkPermission(['REPORTS_CURRENCY_GAINS_VIEW', 'REPORTS_EXCHANGE', 'REPORTS_EXCHANGE_VIEW']), async (req: any, res) => {
  try {
    let branchId = req.query.branchId as string;
    const date = req.query.date ? new Date(req.query.date as string) : new Date();

    if (req.user.role === 'ENCARGADO') {
      const allowedBranches = await prisma.entity.findMany({
        where: { userId: req.user.id },
        select: { branchId: true }
      });
      const allowedIds = allowedBranches.map(e => e.branchId);

      if (!branchId && allowedIds.length === 1) {
        branchId = allowedIds[0];
      } else if (branchId && !allowedIds.includes(branchId)) {
        return res.status(403).json({ error: 'ليس لديك صلاحية الوصول لتقارير هذا الفرع' });
      } else if (!branchId) {
        return res.status(400).json({ error: 'يجب تحديد الفرع' });
      }
    }

    const report = await exchangeService.getUnrealizedGainsLosses(branchId, date);
    res.json(report);
  } catch (error: any) {
    const errorMsg = error.message || "Internal Server Error";
    console.error("META ROUTE ERROR:", error);
    res.status(500).json({ error: errorMsg });
  }
});


// Periods
router.get('/periods', authMiddleware, checkPermission(['PERIODS_VIEW']), async (req, res) => {
  try {
    const periods = await periodService.getAllPeriods();
    res.json(periods);
  } catch (error: any) {
    const errorMsg = error.message || "Internal Server Error";
    console.error("META ROUTE ERROR:", error);
    try {
      fs.appendFileSync(path.join(process.cwd(), 'error_log.txt'), `[${new Date().toISOString()}] ${req.method} ${req.url} - ERROR: ${errorMsg}\nSTACK: ${error.stack}\n\n`);
    } catch (logErr) { }
    res.status(500).json({ error: errorMsg });
  }
});

router.post('/periods', authMiddleware, checkPermission(['PERIODS_CREATE']), async (req, res) => {
  try {
    const { name, startDate, endDate } = req.body;
    const period = await periodService.createPeriod(name, new Date(startDate), new Date(endDate));
    res.status(201).json(period);
  } catch (error: any) {
    const errorMsg = error.message || "Internal Server Error";
    console.error("META ROUTE ERROR:", error);
    try {
      fs.appendFileSync(path.join(process.cwd(), 'error_log.txt'), `[${new Date().toISOString()}] ${req.method} ${req.url} - ERROR: ${errorMsg}\nSTACK: ${error.stack}\n\n`);
    } catch (logErr) { }
    res.status(500).json({ error: errorMsg });
  }
});

router.post('/periods/:id/toggle-lock', authMiddleware, checkPermission(['PERIODS_EDIT']), async (req, res) => {
  try {
    const period = await periodService.toggleLock(req.params.id);
    res.json(period);
  } catch (error: any) {
    const errorMsg = error.message || "Internal Server Error";
    console.error("META ROUTE ERROR:", error);
    try {
      fs.appendFileSync(path.join(process.cwd(), 'error_log.txt'), `[${new Date().toISOString()}] ${req.method} ${req.url} - ERROR: ${errorMsg}\nSTACK: ${error.stack}\n\n`);
    } catch (logErr) { }
    res.status(500).json({ error: errorMsg });
  }
});

// Helper to generate full backup object
const generateFullBackup = async () => {
  const [
    currencies, branches, accounts, periods, journalEntries, journalLines, users,
    roles, permissions, rolePermissions, entities, members, memberSubscriptions,
    attachments, subscriptionCollections, subscriptionCollectionItems, importReports,
    auditLogs, notifications, pageThemeConfigs, currencyRateHistory,
    costCenters, journalLineCostCenters, memberExemptions
  ] = await Promise.all([
    prisma.currency.findMany(),
    prisma.branch.findMany(),
    prisma.account.findMany(),
    prisma.period.findMany(),
    prisma.journalEntry.findMany(),
    prisma.journalLine.findMany(),
    prisma.user.findMany(),
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
    prisma.auditLog.findMany(),
    prisma.notification.findMany(),
    prisma.pageThemeConfig.findMany(),
    prisma.currencyRateHistory.findMany(),
    prisma.costCenter.findMany(),
    prisma.journalLineCostCenter.findMany(),
    prisma.memberExemption.findMany()
  ]);

  return {
    version: '2.0',
    exportedAt: new Date().toISOString(),
    data: {
      currencies, branches, accounts, periods, journalEntries, journalLines, users,
      roles, permissions, rolePermissions, entities, members, memberSubscriptions,
      attachments, subscriptionCollections, subscriptionCollectionItems, importReports,
      auditLogs, notifications, themeConfigs: pageThemeConfigs, currencyHistory: currencyRateHistory,
      costCenters, journalLineCostCenters, memberExemptions
    }
  };
};

/**
 * Validates that the backup data contains all required keys for a full restoration.
 */
const validateBackupData = (data: any) => {
  logRestoration(`Running validateBackupData. Keys: ${Object.keys(data).join(', ')}`);
  const requiredKeys = [
    'currencies', 'branches', 'accounts', 'periods', 'journalEntries',
    'journalLines', 'users', 'roles', 'permissions', 'rolePermissions',
    'entities', 'members', 'memberSubscriptions', 'attachments',
    'subscriptionCollections', 'subscriptionCollectionItems', 'importReports', 'auditLogs',
    // New keys (optional for backward compatibility)
    'costCenters', 'journalLineCostCenters', 'memberExemptions'
  ];

  const criticalKeys = [
    'currencies', 'branches', 'accounts', 'periods', 'journalEntries',
    'journalLines', 'users', 'roles', 'permissions', 'rolePermissions',
    'entities', 'members', 'memberSubscriptions', 'attachments',
    'subscriptionCollections', 'subscriptionCollectionItems', 'importReports', 'auditLogs'
  ];

  const missingKeys = criticalKeys.filter(key => !data[key]);

  if (missingKeys.length > 0) {
    logRestoration(`Validation FAILED: Missing keys: ${missingKeys.join(', ')}`);
    throw new Error(`ملف النسخ الاحتياطي غير مكتمل. الأقسام المفقودة: ${missingKeys.join(', ')}`);
  }

  logRestoration(`Checking counts: Currencies=${data.currencies?.length}, Branches=${data.branches?.length}, Roles=${data.roles?.length}`);

  // Ensure critical tables have at least one record
  if (!data.currencies || data.currencies.length === 0) {
    logRestoration("Validation FAILED: Currencies array empty or missing");
    throw new Error("ملف النسخ الاحتياطي فارغ (لا توجد عملات)");
  }
  if (!data.branches || data.branches.length === 0) {
    logRestoration("Validation FAILED: Branches array empty or missing");
    throw new Error("ملف النسخ الاحتياطي فارغ (لا توجد فروع)");
  }
  if (!data.roles || data.roles.length === 0) {
    logRestoration("Validation FAILED: Roles array empty or missing");
    throw new Error("ملف النسخ الاحتياطي فارغ (لا توجد أدوار)");
  }

  logRestoration("Validation PASSED successfully.");
  return true;
};

// ─── BACKUP — Export all data as JSON ────────────────────────────────────────
router.get('/backup', authMiddleware, checkPermission(['DB_BACKUP']), async (req: any, res) => {
  try {
    const backup = await generateFullBackup();

    // Update SystemConfig with last backup date
    const now = new Date();
    const config = await prisma.systemConfig.findUnique({ where: { id: 'singleton' } });
    if (config) {
      let next = null;
      if (config.backupFrequency === 'DAILY') {
        next = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      } else if (config.backupFrequency === 'WEEKLY') {
        next = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      } else if (config.backupFrequency === 'MONTHLY') {
        next = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());
      }

      await prisma.systemConfig.update({
        where: { id: 'singleton' },
        data: {
          lastBackupAt: now,
          nextBackupAt: next
        }
      });
    } else {
      await prisma.systemConfig.create({
        data: { id: 'singleton', lastBackupAt: now }
      });
    }

    // Mark backup tasks as completed/removed when a backup is done
    await prisma.notification.deleteMany({
      where: {
        type: 'BACKUP_OVERDUE',
        category: 'TASK'
      }
    });

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="family-fund-backup-${new Date().toISOString().split('T')[0]}.json"`);
    res.json(backup);
  } catch (error: any) {
    const errorMsg = error.message || "Internal Server Error";
    console.error("META ROUTE ERROR:", error);
    try {
      fs.appendFileSync(path.join(process.cwd(), 'error_log.txt'), `[${new Date().toISOString()}] ${req.method} ${req.url} - ERROR: ${errorMsg}\nSTACK: ${error.stack}\n\n`);
    } catch (logErr) { }
    res.status(500).json({ error: errorMsg });
  }
});

// Helper to chunk arrays for Prisma createMany (SQLite limit is ~999 variables)
const chunkArray = <T>(array: T[], size: number): T[][] => {
  const result: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
};

// ─── RESTORE PREVIEW — Validate JSON backup summary ──────────────────────────
router.post('/restore-preview', authMiddleware, checkPermission(['DB_RESTORE']), async (req: any, res) => {
  try {
    let { data } = req.body;

    // Support versioned backup format: { version, exportedAt, data: { ... } }
    if (data && data.data && !data.currencies) {
      data = data.data;
    }

    if (!data || !data.currencies) {
      return res.status(400).json({ error: 'ملف النسخ الاحتياطي غير صالح أو تالف.' });
    }

    const summary = {
      users: data.users?.length || 0,
      entities: data.entities?.length || 0,
      members: data.members?.length || 0,
      accounts: data.accounts?.length || 0,
      journalEntries: data.journalEntries?.length || 0,
      journalLines: data.journalLines?.length || 0,
      memberSubscriptions: data.memberSubscriptions?.length || 0,
      currencies: data.currencies?.length || 0,
      branches: data.branches?.length || 0,
      periods: data.periods?.length || 0,
      auditLogs: data.auditLogs?.length || 0,
      notifications: data.notifications?.length || 0,
      costCenters: data.costCenters?.length || 0,
      memberExemptions: data.memberExemptions?.length || 0,
      timestamp: data.timestamp || new Date().toISOString()
    };

    res.json(summary);
  } catch (error: any) {
    const errorMsg = error.message || "Internal Server Error";
    console.error("META ROUTE ERROR:", error);
    try {
      fs.appendFileSync(path.join(process.cwd(), 'error_log.txt'), `[${new Date().toISOString()}] ${req.method} ${req.url} - ERROR: ${errorMsg}\nSTACK: ${error.stack}\n\n`);
    } catch (logErr) { }
    res.status(500).json({ error: errorMsg });
  }
});

const logRestoration = (msg: string) => {
  try {
    const logPath = path.join(process.cwd(), 'restoration_log.txt');
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${msg}\n`);
    console.log(`[RESTORE] ${msg}`);
  } catch (err) { }
};

// Helper to perform the actual restoration process
const performRestoration = async (data: any) => {
  logRestoration(`Starting performRestoration. Keys received: ${Object.keys(data).join(', ')}`);

  await prisma.$transaction(async (tx) => {
    logRestoration("Transaction started. Clearing existing data...");
    // Ordered delete to prevent FK constraint failures (Leaves to Roots)
    await tx.importReport.deleteMany({});
    await tx.auditLog.deleteMany({});
    await tx.notification.deleteMany({}); // Crucial for User deletion
    await tx.subscriptionCollectionItem.deleteMany({});
    await tx.subscriptionCollection.deleteMany({});
    await tx.memberSubscription.deleteMany({});
    await tx.attachment.deleteMany({});
    
    // Cost Center lines reference JournalLines and CostCenters
    await (tx as any).journalLineCostCenter.deleteMany({});
    
    await tx.journalLine.deleteMany({});
    await tx.journalEntry.deleteMany({});

    await tx.$executeRawUnsafe('PRAGMA foreign_keys = OFF;');
    
    await tx.account.deleteMany({});
    
    // MemberExemptions reference Members
    await (tx as any).memberExemption.deleteMany({});
    
    await tx.member.deleteMany({});
    await tx.entity.deleteMany({});

    // PRESERVE ADMIN USERS
    await tx.user.deleteMany({
      where: {
        NOT: {
          role: { name: 'ADMIN' }
        }
      }
    });

    await tx.rolePermission.deleteMany({});
    await tx.role.deleteMany({});
    await tx.permission.deleteMany({});
    await tx.period.deleteMany({});
    await tx.pageThemeConfig.deleteMany({});
    await tx.currencyRateHistory.deleteMany({});
    
    // CostCenters reference Branches
    await (tx as any).costCenter.deleteMany({});
    
    await tx.branch.deleteMany({});
    await tx.currency.deleteMany({});

    logRestoration("Database cleared successfully.");

    // Optional: Clear systemConfig if needed (preserving if it exists)
    try {
      if ((tx as any).systemConfig) {
        await (tx as any).systemConfig.deleteMany({});
      }
    } catch { }

    await tx.$executeRawUnsafe('PRAGMA foreign_keys = ON;');

    // Clear uploads folder
    const uploadsDir = path.join(process.cwd(), 'uploads');
    if (fs.existsSync(uploadsDir)) {
      const files = fs.readdirSync(uploadsDir);
      for (const file of files) {
        // Don't delete the rollback file itself if we are rolling back
        if (file === 'rollback_backup.json') continue;
        try {
          fs.unlinkSync(path.join(uploadsDir, file));
        } catch { }
      }
    }

    // ─── Re-insert everything from backup ───
    try {
      if (data.currencies?.length) await tx.currency.createMany({ data: data.currencies });
      if (data.branches?.length) await tx.branch.createMany({ data: data.branches });
      if (data.costCenters?.length) {
        // Handle hierarchical CostCenters
        const inserted = new Set<string>();
        const remaining = [...data.costCenters];
        let passes = 0;
        while (remaining.length > 0 && passes < 10) {
          passes++;
          for (let i = remaining.length - 1; i >= 0; i--) {
            const item = remaining[i];
            if (!item.parentId || inserted.has(item.parentId)) {
              await (tx as any).costCenter.create({ data: item });
              inserted.add(item.id);
              remaining.splice(i, 1);
            }
          }
        }
        // If some are still remaining (circular or missing parents), insert them anyway
        if (remaining.length > 0) {
          for (const item of remaining) {
            const { parentId, ...rest } = item;
            await (tx as any).costCenter.create({ data: rest });
          }
        }
      }
    } catch (e: any) {
      throw new Error("خطأ: العملات والفروع ومراكز التكلفة@@@" + e.message);
    }

    try {
      if (data.roles?.length) await tx.role.createMany({ data: data.roles });
      if (data.permissions?.length) await tx.permission.createMany({ data: data.permissions });
      if (data.rolePermissions?.length) await tx.rolePermission.createMany({ data: data.rolePermissions });
    } catch (e: any) {
      logRestoration(`Error re-inserting roles/permissions: ${e.message}`);
      throw new Error("خطأ: الصلاحيات والأدوار@@@" + e.message);
    }

    logRestoration(`Re-inserting components: 
      Currencies: ${data.currencies?.length || 0}
      Branches: ${data.branches?.length || 0}
      Roles: ${data.roles?.length || 0}
      Permissions: ${data.permissions?.length || 0}
      Entities: ${data.entities?.length || 0}
      Members: ${data.members?.length || 0}
      Accounts: ${data.accounts?.length || 0}
      Journal Entries: ${data.journalEntries?.length || 0}
    `);

    try {
      if (data.users?.length) {
        const bcrypt = require('bcryptjs');
        const defaultPassword = await bcrypt.hash('123456', 10);

        // Map roles to IDs for lookup if they are strings in the backup
        const roles = await tx.role.findMany();

        for (const u of data.users) {
          const userData: any = { ...u };
          const originalRole = userData.role;
          const originalRoleId = userData.roleId;

          // Remove relation fields and password from data
          delete userData.role;
          delete userData.password;
          delete userData.roleId;

          if (u.password) {
            userData.password = u.password;
          } else {
            userData.password = defaultPassword;
          }

          // Force correct roleId
          if (typeof originalRole === 'string') {
            const roleObj = roles.find(r => r.name === originalRole);
            if (roleObj) userData.roleId = roleObj.id;
          } else if (originalRoleId) {
            userData.roleId = originalRoleId;
          }

          const existing = await tx.user.findFirst({
            where: {
              OR: [{ id: u.id }, { username: u.username }]
            }
          });

          if (existing) {
            await tx.user.update({
              where: { id: existing.id },
              data: userData
            });
          } else {
            await tx.user.create({ data: userData });
          }
        }
      }
    } catch (e: any) {
      throw new Error("خطأ: المستخدمين@@@" + e.message);
    }

    try {
      if (data.entities?.length) {
        for (const chunk of chunkArray(data.entities, 100)) {
          await tx.entity.createMany({ data: chunk as any });
        }
      }
    } catch (e: any) {
      throw new Error("خطأ: الجهات@@@" + e.message);
    }

    try {
      if (data.members?.length) {
        const inserted = new Set<string>();
        const remaining = [...data.members];
        let passes = 0;
        while (remaining.length > 0 && passes < 50) {
          passes++;
          for (let i = remaining.length - 1; i >= 0; i--) {
            const item = remaining[i];
            if (!item.managerId || inserted.has(item.managerId)) {
              await tx.member.create({ data: item });
              inserted.add(item.id);
              remaining.splice(i, 1);
            }
          }
        }
        if (remaining.length > 0) {
          for (const item of remaining) {
            const { managerId, ...rest } = item;
            await tx.member.create({ data: rest });
          }
        }
      }
    } catch (e: any) {
      throw new Error("خطأ: الأعضاء@@@" + e.message);
    }

    try {
      if (data.accounts?.length) {
        const inserted = new Set<string>();
        const remaining = [...data.accounts];
        let passes = 0;
        while (remaining.length > 0 && passes < 50) {
          passes++;
          for (let i = remaining.length - 1; i >= 0; i--) {
            const acc = remaining[i];
            if (!acc.parentId || inserted.has(acc.parentId)) {
              await tx.account.create({ data: acc });
              inserted.add(acc.id);
              remaining.splice(i, 1);
            }
          }
        }
        if (remaining.length > 0) {
          for (const acc of remaining) {
            const { parentId, ...rest } = acc;
            await tx.account.create({ data: rest });
          }
        }
      }
    } catch (e: any) {
      throw new Error("خطأ: دليل الحسابات@@@" + e.message);
    }

    try {
      if (data.periods?.length) {
        for (const chunk of chunkArray(data.periods, 100)) {
          await tx.period.createMany({ data: chunk as any });
        }
      }
      if (data.journalEntries?.length) {
        for (const chunk of chunkArray(data.journalEntries, 50)) {
          await tx.journalEntry.createMany({ data: chunk as any });
        }
      }
      if (data.journalLines?.length) {
        for (const chunk of chunkArray(data.journalLines, 50)) {
          await tx.journalLine.createMany({ data: chunk as any });
        }
      }
      if (data.journalLineCostCenters?.length) {
        for (const chunk of chunkArray(data.journalLineCostCenters, 100)) {
          await (tx as any).journalLineCostCenter.createMany({ data: chunk as any });
        }
      }
    } catch (e: any) {
      throw new Error("خطأ: القيود المحاسبية@@@" + e.message);
    }

    try {
      if (data.memberSubscriptions?.length) {
        for (const chunk of chunkArray(data.memberSubscriptions, 100)) {
          await tx.memberSubscription.createMany({ data: chunk as any });
        }
      }
      if (data.attachments?.length) {
        for (const chunk of chunkArray(data.attachments, 100)) {
          await tx.attachment.createMany({ data: chunk as any });
        }
      }
      if (data.subscriptionCollections?.length) {
        for (const chunk of chunkArray(data.subscriptionCollections, 50)) {
          await tx.subscriptionCollection.createMany({ data: chunk as any });
        }
      }
      if (data.subscriptionCollectionItems?.length) {
        for (const chunk of chunkArray(data.subscriptionCollectionItems, 100)) {
          await tx.subscriptionCollectionItem.createMany({ data: chunk as any });
        }
      }
      if (data.auditLogs?.length) {
        for (const chunk of chunkArray(data.auditLogs, 100)) {
          await tx.auditLog.createMany({ data: chunk as any });
        }
      }
      if (data.notifications?.length) {
        for (const chunk of chunkArray(data.notifications, 100)) {
          await tx.notification.createMany({ data: chunk as any });
        }
      }
      if (data.themeConfigs?.length) {
        for (const chunk of chunkArray(data.themeConfigs, 100)) {
          await tx.pageThemeConfig.createMany({ data: chunk as any });
        }
      }
      if (data.currencyHistory?.length) {
        for (const chunk of chunkArray(data.currencyHistory, 100)) {
          await tx.currencyRateHistory.createMany({ data: chunk as any });
        }
      }
      if (data.memberExemptions?.length) {
        for (const chunk of chunkArray(data.memberExemptions, 100)) {
          await (tx as any).memberExemption.createMany({ data: chunk as any });
        }
      }
    } catch (e: any) {
      logRestoration(`Error re-inserting subscriptions/audit: ${e.message}`);
      throw new Error("خطأ: الاشتراكات والتدقيق@@@" + e.message);
    }

    logRestoration("Restoration transaction completed successfully.");
  }, {
    timeout: 90000 // 1.5 minutes timeout for large backups
  });
};

// ───   — Import JSON backup ────────────────────────────────────────────
router.post('/restore', authMiddleware, checkPermission(['DB_RESTORE']), async (req: any, res) => {
  try {
    let { data } = req.body;
    logRestoration(`Received /restore request. Body keys: ${Object.keys(req.body).join(', ')}`);
    if (data) logRestoration(`Data object keys: ${Object.keys(data).join(', ')}`);

    // Support versioned backup format: { version, exportedAt, data: { ... } }
    if (data && data.data && !data.currencies) {
      logRestoration("Detected versioned backup format. Drilling into 'data' property.");
      data = data.data;
    }

    if (!data || !data.currencies) {
      logRestoration("Validation failed: No data or no currencies found in the object.");
      return res.status(400).json({ error: 'ملف النسخ الاحتياطي غير صالح أو تالف.' });
    }

    // STRICT VALIDATION
    try {
      validateBackupData(data);
    } catch (valError: any) {
      return res.status(400).json({ error: valError.message });
    }

    // CREATE EMERGENCY ROLLBACK BACKUP FIRST
    try {
      const rollbackFile = path.join(process.cwd(), 'uploads', 'rollback_backup.json');
      let shouldCreate = true;

      if (fs.existsSync(rollbackFile)) {
        const stats = fs.statSync(rollbackFile);
        // If existing rollback is larger than 50KB, it likely has real data.
        // Don't overwrite it with a potentially empty state from current DB.
        if (stats.size > 50000) {
          logRestoration("Existing rollback backup is large (>50KB). Preserving it to avoid overwriting with empty state.");
          shouldCreate = false;
        }
      }

      if (shouldCreate) {
        const emergencyBackup = await generateFullBackup();
        // Only save if it has some data (at least one entity or member)
        const d = emergencyBackup.data;
        if (d.entities?.length || d.members?.length || d.journalEntries?.length) {
          const uploadsDir = path.join(process.cwd(), 'uploads');
          if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);
          fs.writeFileSync(rollbackFile, JSON.stringify(emergencyBackup));
          logRestoration("Emergency rollback backup created successfully.");
        } else {
          logRestoration("Current database is almost empty. Skipping rollback backup creation to preserve any previous state.");
        }
      }
    } catch (rollbackErr: any) {
      console.error("FAILED TO CREATE ROLLBACK BACKUP:", rollbackErr);
      logRestoration(`Failed to create rollback backup: ${rollbackErr?.message}`);
    }

    await performRestoration(data);

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
    const errorMsg = error.message || "Internal Server Error";
    console.error("META ROUTE ERROR:", error);
    try {
      fs.appendFileSync(path.join(process.cwd(), 'error_log.txt'), `[${new Date().toISOString()}] ${req.method} ${req.url} - ERROR: ${errorMsg}\nSTACK: ${error.stack}\n\n`);
    } catch (logErr) { }
    res.status(500).json({ error: errorMsg });
  }
});

// ─── ROLLBACK — Revert to the emergency backup created before last restore ───
router.post('/rollback', authMiddleware, checkPermission(['DB_RESTORE']), async (req: any, res) => {
  try {
    const rollbackFile = path.join(process.cwd(), 'uploads', 'rollback_backup.json');
    console.log(`[ROLLBACK] Checking path: ${rollbackFile}`);
    console.log(`[ROLLBACK] CWD: ${process.cwd()}`);
    if (!fs.existsSync(rollbackFile)) {
      console.error(`[ROLLBACK] File not found at: ${rollbackFile}`);
      return res.status(404).json({ error: 'لا يوجد نسخة احتياطية للرجوع إليها.' });
    }

    const backupContent = fs.readFileSync(rollbackFile, 'utf8');
    const backup = JSON.parse(backupContent);
    const data = backup.data || backup;

    logRestoration("Starting rollback process...");
    try {
      validateBackupData(data);
    } catch (valError: any) {
      logRestoration(`Rollback FAILED validation: ${valError.message}`);
      return res.status(400).json({ error: `النسخة الاحتياطية للرجوع إليها غير صالحة أو فارغة: ${valError.message}` });
    }

    await performRestoration(data);

    res.json({ success: true, message: 'تم التراجع عن التغييرات بنجاح.' });
  } catch (error: any) {
    res.status(500).json({ error: `فشل التراجع: ${error.message}` });
  }
});

// ─── RESET ALL DATA ──────────────────────────────────────────────────────────
// Deletes ALL financial data AND non-ADMIN users, in FK-safe order.
// The ADMIN user is always preserved.
router.delete('/reset-all', authMiddleware, checkPermission(['DB_RESET']), async (req: any, res) => {
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
    await prisma.notification.deleteMany({});
    await prisma.pageThemeConfig.deleteMany({});
    await prisma.journalLineCostCenter.deleteMany({});
    await prisma.journalLine.deleteMany({});
    await prisma.journalEntry.deleteMany({});
    await prisma.memberExemption.deleteMany({});
    await prisma.member.deleteMany({});
    await prisma.entity.deleteMany({});
    await prisma.costCenter.deleteMany({});
    await prisma.account.deleteMany({});
    await prisma.period.deleteMany({});
    await prisma.currencyRateHistory.deleteMany({});
    await prisma.branch.deleteMany({});
    await prisma.currency.deleteMany({});

    // Clear uploads folder
    const uploadsDir = path.join(process.cwd(), 'uploads');
    if (fs.existsSync(uploadsDir)) {
      const files = fs.readdirSync(uploadsDir);
      for (const file of files) {
        fs.unlinkSync(path.join(uploadsDir, file));
      }
    }

    // 8. Delete non-ADMIN users (keep the admin account)
    await prisma.user.deleteMany({
      where: { role: { name: { not: 'ADMIN' } } }
    });

    res.json({
      success: true,
      message: 'تم مسح جميع البيانات والمستخدمين (ما عدا المدير) بنجاح. التطبيق جاهز للبداية من جديد.'
    });
  } catch (error: any) {
    const errorMsg = error.message || "Internal Server Error";
    console.error("META ROUTE ERROR:", error);
    try {
      fs.appendFileSync(path.join(process.cwd(), 'error_log.txt'), `[${new Date().toISOString()}] ${req.method} ${req.url} - ERROR: ${errorMsg}\nSTACK: ${error.stack}\n\n`);
    } catch (logErr) { }
    res.status(500).json({ error: errorMsg });
  }
});

// ─── System Config ───────────────────────────────────────────────────────────
router.get('/system-config', authMiddleware, async (req, res) => {
  try {
    let config = await prisma.systemConfig.findUnique({ where: { id: 'singleton' } });
    if (!config) {
      config = await prisma.systemConfig.create({
        data: { id: 'singleton', backupFrequency: 'NONE' }
      });
    }

    // Check if backup is overdue and create notification
    if (config.nextBackupAt && config.backupFrequency !== 'NONE' && new Date(config.nextBackupAt) < new Date()) {
      const userId = (req as any).user.id;
      const existing = await prisma.notification.findFirst({
        where: {
          userId,
          type: 'BACKUP_OVERDUE',
          category: 'TASK',
          isCompleted: false
        }
      });

      if (!existing) {
        await prisma.notification.create({
          data: {
            userId,
            title: 'موعد النسخ الاحتياطي',
            message: `لقد حان موعد إجراء النسخة الاحتياطية الدورية (${config.backupFrequency}).`,
            category: 'TASK',
            type: 'BACKUP_OVERDUE',
            link: '/settings'
          }
        });
      }
    }

    res.json(config);
  } catch (error: any) {
    const errorMsg = error.message || "Internal Server Error";
    console.error("META ROUTE ERROR:", error);
    try {
      fs.appendFileSync(path.join(process.cwd(), 'error_log.txt'), `[${new Date().toISOString()}] ${req.method} ${req.url} - ERROR: ${errorMsg}\nSTACK: ${error.stack}\n\n`);
    } catch (logErr) { }
    res.status(500).json({ error: errorMsg });
  }
});

router.patch('/system-config', authMiddleware, checkRole(['ADMIN']), async (req, res) => {
  try {
    const { backupFrequency } = req.body;

    // Calculate next backup date based on frequency
    let nextBackupAt = null;
    const now = new Date();
    if (backupFrequency === 'DAILY') {
      nextBackupAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    } else if (backupFrequency === 'WEEKLY') {
      nextBackupAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    } else if (backupFrequency === 'MONTHLY') {
      nextBackupAt = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());
    }

    const config = await prisma.systemConfig.upsert({
      where: { id: 'singleton' },
      update: { backupFrequency, nextBackupAt },
      create: { id: 'singleton', backupFrequency, nextBackupAt }
    });
    res.json(config);
  } catch (error: any) {
    const errorMsg = error.message || "Internal Server Error";
    console.error("META ROUTE ERROR:", error);
    try {
      fs.appendFileSync(path.join(process.cwd(), 'error_log.txt'), `[${new Date().toISOString()}] ${req.method} ${req.url} - ERROR: ${errorMsg}\nSTACK: ${error.stack}\n\n`);
    } catch (logErr) { }
    res.status(500).json({ error: errorMsg });
  }
});

// ─── Theme Configuration ───────────────────────────────────────────────────
router.get('/themes', authMiddleware, async (req, res) => {
  try {
    const configs = await prisma.pageThemeConfig.findMany();
    res.json(configs);
  } catch (error: any) {
    const errorMsg = error.message || "Internal Server Error";
    console.error("META ROUTE ERROR:", error);
    try {
      fs.appendFileSync(path.join(process.cwd(), 'error_log.txt'), `[${new Date().toISOString()}] ${req.method} ${req.url} - ERROR: ${errorMsg}\nSTACK: ${error.stack}\n\n`);
    } catch (logErr) { }
    res.status(500).json({ error: errorMsg });
  }
});

router.patch('/themes', authMiddleware, checkPermission(['THEMES_EDIT']), async (req, res) => {
  try {
    const { path, colorName } = req.body;
    if (!path || !colorName) return res.status(400).json({ error: 'Path and colorName are required' });

    const config = await prisma.pageThemeConfig.upsert({
      where: { path },
      update: { colorName },
      create: { path, colorName }
    });

    res.json(config);
  } catch (error: any) {
    console.error("META ROUTE ERROR:", error);
    res.status(500).json({ error: error.message || "Internal Server Error" });
  }
});

router.delete('/themes', authMiddleware, checkPermission(['THEMES_EDIT']), async (req, res) => {
  try {
    const { path } = req.body;
    if (!path) return res.status(400).json({ error: 'Path is required' });

    await prisma.pageThemeConfig.delete({
      where: { path }
    });

    res.json({ success: true, message: 'Theme reset to default' });
  } catch (error: any) {
    if (error.code === 'P2025') {
      return res.json({ success: true, message: 'Theme already at default' });
    }
    res.status(500).json({ error: error.message });
  }
});

export default router;
