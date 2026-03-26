import { Router } from 'express';
import { JournalEntryService } from '../../../application/services/JournalEntryService';
import { authMiddleware } from '../middlewares/authMiddleware';
import { checkPermission } from '../middlewares/roleMiddleware';
import prisma from '../../../infrastructure/database/prisma';

const router = Router();
const service = new JournalEntryService();

const getPermission = (type: string | undefined, action: 'VIEW' | 'CREATE' | 'EDIT' | 'DELETE' | 'PRINT') => {
  if (!type) return [`JOURNAL_${action}`, `RECEIPT_${action}`, `PAYMENT_${action}`];
  switch (type) {
    case 'JOURNAL': return [`JOURNAL_${action}`];
    case 'RECEIPT': return [`RECEIPT_${action}`];
    case 'PAYMENT': return [`PAYMENT_${action}`];
    default: return [`JOURNAL_${action}`];
  }
};

router.post('/', authMiddleware, async (req: any, res, next) => {
  if (req.user.role === 'ENCARGADO') return next();
  const perms = getPermission(req.body.type, 'CREATE');
  return checkPermission(perms)(req, res, next);
}, async (req: any, res) => {
  try {
    const entry = await service.createDraft(req.user, {
      ...req.body,
      createdBy: req.user.id
    });

    if (entry.type === 'RECEIPT' || entry.type === 'PAYMENT' || entry.type === 'GENERAL') {
      const targetUsers = await prisma.user.findMany({
          where: { role: { name: { in: ['ADMIN', 'RESPONSABLE'] } } }
      });
      if (targetUsers.length > 0) {
          const typeLabel = entry.type === 'RECEIPT' ? 'سند قبض' : entry.type === 'PAYMENT' ? 'سند صرف' : 'قيد يومية';
          const linkPath = entry.type === 'RECEIPT' ? 'receipts' : entry.type === 'PAYMENT' ? 'payments' : 'journals';
          
          await prisma.notification.createMany({
              data: targetUsers.map((u: any) => ({
                  userId: u.id,
                  title: `${typeLabel} جديد`,
                  message: `تم إنشاء ${typeLabel} جديد برقم ${entry.entryNumber} بقيمة ${entry.totalAmount}`,
                  type: entry.type === 'GENERAL' ? 'JOURNAL' : entry.type,
                  link: `/vouchers/${linkPath}?id=${entry.id}`
              }))
          });
      }
    }

    res.status(201).json(entry);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/', authMiddleware, async (req: any, res, next) => {
  if (req.user.role === 'ENCARGADO') return next();
  const perms = getPermission(req.query.type as string, 'VIEW');
  return checkPermission(perms)(req, res, next);
}, async (req: any, res) => {
  try {
    const entries = await service.getEntries(
      req.user,
      req.query.branchId as string,
      req.query.type as string
    );
    res.json(entries);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', authMiddleware, async (req: any, res) => {
  try {
    const entry = await service.getEntryById(req.user, req.params.id);
    if (!entry) return res.status(404).json({ error: 'Entry not found' });

    // Correct mapping: GENERAL type maps to JOURNAL permission
    const permPrefix = entry.type === 'GENERAL' ? 'JOURNAL' : entry.type;
    const canView = req.user.role === 'ADMIN' || req.user.role === 'ENCARGADO' || req.user.permissions.includes(`${permPrefix}_VIEW`);
    if (!canView) return res.status(403).json({ error: 'Forbidden' });

    res.json(entry);
  } catch (error: any) {
    res.status(404).json({ error: error.message });
  }
});

router.put('/:id', authMiddleware, async (req: any, res) => {
  try {
    const entry = await service.getEntryById(req.user, req.params.id);
    if (!entry) return res.status(404).json({ error: 'Entry not found' });

    const permPrefix = entry.type === 'GENERAL' ? 'JOURNAL' : entry.type;
    const canEdit = req.user.role === 'ADMIN' || req.user.role === 'ENCARGADO' || req.user.permissions.includes(`${permPrefix}_EDIT`);
    if (!canEdit) return res.status(403).json({ error: 'Forbidden' });

    const updated = await service.updateEntry(req.user, req.params.id, req.body);

    if (updated.type === 'RECEIPT' || updated.type === 'PAYMENT' || updated.type === 'GENERAL') {
      const targetUsers = await prisma.user.findMany({
          where: { role: { name: { in: ['ADMIN', 'RESPONSABLE'] } } }
      });
      if (targetUsers.length > 0) {
          const typeLabel = updated.type === 'RECEIPT' ? 'سند قبض' : updated.type === 'PAYMENT' ? 'سند صرف' : 'قيد يومية';
          const linkPath = updated.type === 'RECEIPT' ? 'receipts' : updated.type === 'PAYMENT' ? 'payments' : 'journals';
          
          await prisma.notification.createMany({
              data: targetUsers.map((u: any) => ({
                  userId: u.id,
                  title: `تعديل ${typeLabel}`,
                  message: `تم تعديل ${typeLabel} رقم ${updated.entryNumber} بواسطة ${req.user.username}`,
                  type: updated.type === 'GENERAL' ? 'JOURNAL' : updated.type,
                  link: `/vouchers/${linkPath}?id=${updated.id}`
              }))
          });
      }
    }

    res.json(updated);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/:id', authMiddleware, async (req: any, res) => {
  try {
    const entry = await service.getEntryById(req.user, req.params.id);
    if (!entry) return res.status(404).json({ error: 'Entry not found' });

    const permPrefix = entry.type === 'GENERAL' ? 'JOURNAL' : entry.type;
    const canDelete = req.user.role === 'ADMIN' || req.user.role === 'ENCARGADO' || req.user.permissions.includes(`${permPrefix}_DELETE`);
    if (!canDelete) return res.status(403).json({ error: 'Forbidden' });

    await service.deleteEntry(req.user, req.params.id);
    res.status(204).end();
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/:id/post', authMiddleware, async (req: any, res) => {
  try {
    const entry = await service.getEntryById(req.user, req.params.id);
    if (!entry) return res.status(404).json({ error: 'Entry not found' });

    const permPrefix = entry.type === 'GENERAL' ? 'JOURNAL' : entry.type;
    const canPost = req.user.role === 'ADMIN' || req.user.role === 'ENCARGADO' || req.user.permissions.includes(`${permPrefix}_EDIT`);
    if (!canPost) return res.status(403).json({ error: 'Forbidden' });

    const posted = await service.postEntry(req.user, req.params.id);
    
    if (posted.type === 'RECEIPT' || posted.type === 'PAYMENT' || posted.type === 'GENERAL') {
      const targetUsers = await prisma.user.findMany({
          where: { role: { name: { in: ['ADMIN', 'RESPONSABLE'] } } }
      });
      if (targetUsers.length > 0) {
          const typeLabel = posted.type === 'RECEIPT' ? 'سند قبض' : posted.type === 'PAYMENT' ? 'سند صرف' : 'قيد يومية';
          const linkPath = posted.type === 'RECEIPT' ? 'receipts' : posted.type === 'PAYMENT' ? 'payments' : 'journals';
          
          await prisma.notification.createMany({
              data: targetUsers.map((u: any) => ({
                  userId: u.id,
                  title: `اعتماد ${typeLabel}`,
                  message: `تم اعتماد ${typeLabel} رقم ${posted.entryNumber} بواسطة ${req.user.username}`,
                  type: posted.type === 'GENERAL' ? 'JOURNAL' : posted.type,
                  link: `/vouchers/${linkPath}?id=${posted.id}`
              }))
          });
      }
    }

    res.json(posted);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/:id/unpost', authMiddleware, async (req: any, res) => {
  try {
    const entry = await service.getEntryById(req.user, req.params.id);
    if (!entry) return res.status(404).json({ error: 'Entry not found' });

    const permPrefix = entry.type === 'GENERAL' ? 'JOURNAL' : entry.type;
    const canUnpost = req.user.role === 'ADMIN' || req.user.role === 'ENCARGADO' || req.user.permissions.includes(`${permPrefix}_EDIT`);
    if (!canUnpost) return res.status(403).json({ error: 'Forbidden' });

    const unposted = await service.unpostEntry(req.user, req.params.id);

    if (unposted.type === 'RECEIPT' || unposted.type === 'PAYMENT' || unposted.type === 'GENERAL') {
      const targetUsers = await prisma.user.findMany({
          where: { role: { name: { in: ['ADMIN', 'RESPONSABLE'] } } }
      });
      if (targetUsers.length > 0) {
          const typeLabel = unposted.type === 'RECEIPT' ? 'سند قبض' : unposted.type === 'PAYMENT' ? 'سند صرف' : 'قيد يومية';
          const linkPath = unposted.type === 'RECEIPT' ? 'receipts' : unposted.type === 'PAYMENT' ? 'payments' : 'journals';
          
          await prisma.notification.createMany({
              data: targetUsers.map((u: any) => ({
                  userId: u.id,
                  title: `إلغاء اعتماد ${typeLabel}`,
                  message: `تم إلغاء اعتماد ${typeLabel} رقم ${unposted.entryNumber} بواسطة ${req.user.username}`,
                  type: unposted.type === 'GENERAL' ? 'JOURNAL' : unposted.type,
                  link: `/vouchers/${linkPath}?id=${unposted.id}`
              }))
          });
      }
    }

    res.json(unposted);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

export default router;
