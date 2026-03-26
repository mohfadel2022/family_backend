import { Router } from 'express';
import { authMiddleware } from '../middlewares/authMiddleware';
import prisma from '../../../infrastructure/database/prisma';
import { SubscriptionService } from '../../../application/services/SubscriptionService';

import { checkPermission } from '../middlewares/roleMiddleware';

const router = Router();
const service = new SubscriptionService();

// Entities CRUD
router.get('/entities', authMiddleware, checkPermission(['ENTITIES_VIEW']), async (req: any, res) => {
    try {
        const where: any = {};
        if (req.user.role === 'ENCARGADO') {
            where.userId = req.user.id;
        }

        const entities = await prisma.entity.findMany({
            where,
            include: {
                currency: true,
                personInCharge: { select: { id: true, name: true, username: true } },
                branch: { select: { id: true, name: true } }
            }
        });
        res.json(entities);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/entities', authMiddleware, checkPermission(['ENTITIES_CREATE']), async (req, res) => {
    try {
        const { name, code, currencyId, userId, annualSubscription, branchId } = req.body;
        const entity = await prisma.entity.create({
            data: {
                name,
                code,
                currencyId,
                userId,
                annualSubscription: Number(annualSubscription) || 0,
                branchId
            }
        });
        res.status(201).json(entity);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

router.put('/entities/:id', authMiddleware, checkPermission(['ENTITIES_EDIT']), async (req, res) => {
    try {
        const { name, code, currencyId, userId, annualSubscription, branchId } = req.body;
        const entity = await prisma.entity.update({
            where: { id: req.params.id },
            data: {
                name,
                code,
                currencyId,
                userId,
                annualSubscription: Number(annualSubscription) || 0,
                branchId
            }
        });
        res.json(entity);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

router.delete('/entities/:id', authMiddleware, checkPermission(['ENTITIES_DELETE']), async (req, res) => {
    try {
        await prisma.entity.delete({ where: { id: req.params.id } });
        res.status(204).end();
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

// Members CRUD
router.get('/members', authMiddleware, checkPermission(['MEMBERS_VIEW']), async (req: any, res) => {
    try {
        const entityId = req.query.entityId as string;
        const members = await service.getMembers(req.user, entityId);
        res.json(members);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/members', authMiddleware, checkPermission(['MEMBERS_CREATE']), async (req, res) => {
    try {
        console.log('Create Member Body:', req.body);
        const { name, entityId, affiliationYear, stoppedAt, status, phone, managerId } = req.body;

        // Validation: require stoppedAt if status is not ACTIVE
        if ((status === 'DECEASED' || status === 'INACTIVE') && (!stoppedAt || stoppedAt === 'null')) {
            return res.status(400).json({ error: 'عذراً، يجب تحديد سنة التوقف أو الوفاة للحالات غير النشطة' });
        }

        if ((req as any).user.role === 'ENCARGADO') {
            const ownEntity = await prisma.entity.findFirst({
                where: { id: entityId, userId: (req as any).user.id }
            });
            if (!ownEntity) return res.status(403).json({ error: 'لا تملك صلاحية إضافة عضو لهذه الجهة' });
        }

        const member = await prisma.member.create({
            data: {
                name: name.trim(),
                entityId,
                affiliationYear: Number(affiliationYear) || new Date().getFullYear(),
                status: (status && status !== 'null') ? status : 'ACTIVE',
                stoppedAt: stoppedAt ? new Date(stoppedAt) : null,
                phone: phone || null,
                managerId: managerId || null
            }
        });
        // Audit Logging
        await prisma.auditLog.create({
            data: {
                userId: (req as any).user.id,
                action: 'CREATE_MEMBER',
                entity: 'Member',
                entityId: member.id,
                details: { name: member.name }
            }
        });

        // Notifications for Admins/Responsables
        const targetUsers = await prisma.user.findMany({
            where: { role: { name: { in: ['ADMIN', 'RESPONSABLE'] } } }
        });
        
        if (targetUsers.length > 0) {
            await prisma.notification.createMany({
                data: targetUsers.map(u => ({
                    userId: u.id,
                    title: 'عضو جديد',
                    message: `تمت إضافة العضو الجديد "${member.name}" بواسطة ${(req as any).user.username}`,
                    type: 'MEMBER',
                    link: `/subscriptions/members?id=${member.id}`
                }))
            });
        }

        res.status(201).json(member);
    } catch (error: any) {
        console.error('Create Member Error:', error);
        res.status(500).json({ error: error.message });
    }
});

router.put('/members/:id', authMiddleware, checkPermission(['MEMBERS_EDIT']), async (req, res) => {
    try {
        console.log('Update Member Body:', req.body);
        const { name, entityId, affiliationYear, stoppedAt, status, phone, managerId } = req.body;

        // Validation: require stoppedAt if status is not ACTIVE
        if ((status === 'DECEASED' || status === 'INACTIVE') && (!stoppedAt || stoppedAt === 'null')) {
            return res.status(400).json({ error: 'عذراً، يجب تحديد سنة التوقف أو الوفاة للحالات غير النشطة' });
        }

        if ((req as any).user.role === 'ENCARGADO') {
            const member = await prisma.member.findUnique({
                where: { id: req.params.id },
                include: { entity: true }
            });
            if (!member || member.entity.userId !== (req as any).user.id) {
                return res.status(403).json({ error: 'لا تملك صلاحية تعديل هذا العضو' });
            }
            // If changing entity
            if (entityId && entityId !== member.entityId) {
                const ownNewEntity = await prisma.entity.findFirst({
                    where: { id: entityId, userId: (req as any).user.id }
                });
                if (!ownNewEntity) return res.status(403).json({ error: 'لا تملك صلاحية نقل العضو لهذه الجهة' });
            }
        }

        const member = await prisma.member.update({
            where: { id: req.params.id },
            data: {
                name: name.trim(),
                entityId,
                affiliationYear: Number(affiliationYear) || new Date().getFullYear(),
                status: (status && status !== 'null') ? status : 'ACTIVE',
                stoppedAt: (stoppedAt && stoppedAt !== 'null') ? new Date(stoppedAt) : null,
                phone: phone || null,
                managerId: managerId || null
            }
        });
        // Audit Logging
        await prisma.auditLog.create({
            data: {
                userId: (req as any).user.id,
                action: 'UPDATE_MEMBER',
                entity: 'Member',
                entityId: member.id,
                details: { name: member.name }
            }
        });

        res.json(member);
    } catch (error: any) {
        console.error('Update Member Error:', error);
        res.status(500).json({ error: error.message });
    }
});

router.delete('/members/:id', authMiddleware, checkPermission(['MEMBERS_DELETE']), async (req: any, res) => {
    try {
        const id = req.params.id;

        if (req.user.role === 'ENCARGADO') {
            const member = await prisma.member.findUnique({
                where: { id },
                include: { entity: true }
            });
            if (!member || member.entity.userId !== req.user.id) {
                return res.status(403).json({ error: 'لا تملك صلاحية حذف هذا العضو' });
            }
        }

        // Check for dependencies
        const subsCount = await prisma.memberSubscription.count({ where: { memberId: id } });
        const itemsCount = await prisma.subscriptionCollectionItem.count({ where: { memberId: id } });
        const subordinatesCount = await prisma.member.count({ where: { managerId: id } });

        if (subsCount > 0 || itemsCount > 0 || subordinatesCount > 0) {
            let errorMsg = 'لا يمكن حذف العضو لوجود بيانات مرتبطة به: ';
            if (subsCount > 0) errorMsg += 'اشتراكات، ';
            if (itemsCount > 0) errorMsg += 'عمليات تحصيل، ';
            if (subordinatesCount > 0) errorMsg += 'أعضاء مسجلين تحت إشرافه، ';
            errorMsg = errorMsg.slice(0, -2) + '. يرجى حذف العمليات المرتبطة أو تغيير حالة العضو.';

            return res.status(400).json({ error: errorMsg });
        }

        await prisma.member.delete({
            where: { id }
        });

        // Audit Logging
        await prisma.auditLog.create({
            data: {
                userId: (req as any).user.id,
                action: 'DELETE_MEMBER',
                entity: 'Member',
                entityId: req.params.id
            }
        });

        res.status(204).end();
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/members/import', authMiddleware, checkPermission(['MEMBERS_IMPORT']), async (req: any, res) => {
    try {
        const { filename, rows, defaultYear } = req.body;
        if (!filename || !rows || !Array.isArray(rows)) {
            return res.status(400).json({ error: 'بيانات الاستيراد غير صحيحة' });
        }

        const report = await service.importMembers(req.user, filename, rows, Number(defaultYear));
        res.status(201).json(report);
    } catch (error: any) {
        console.error('Import Members Error:', error);
        res.status(500).json({ error: error.message });
    }
});

router.get('/members/import/reports', authMiddleware, checkPermission(['MEMBERS_VIEW']), async (req: any, res) => {
    try {
        const reports = await service.getImportReports();
        res.json(reports);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Exemptions
router.get('/members/:id/exemptions', authMiddleware, checkPermission(['MEMBERS_VIEW']), async (req, res) => {
    try {
        const exemptions = await prisma.memberExemption.findMany({
            where: { memberId: req.params.id },
            orderBy: { year: 'desc' }
        });
        res.json(exemptions);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/members/exemptions', authMiddleware, checkPermission(['MEMBERS_EDIT']), async (req: any, res) => {
    try {
        const { memberId, year, reason } = req.body;
        
        // Ownership check if Encargado
        if (req.user.role === 'ENCARGADO') {
            const member = await prisma.member.findUnique({
                where: { id: memberId },
                include: { entity: true }
            });
            if (!member || member.entity.userId !== req.user.id) {
                return res.status(403).json({ error: 'لا تملك صلاحية تعديل هذا العضو' });
            }
        }

        // Check if subscription already exists for this year
        const existingSub = await prisma.memberSubscription.findFirst({
            where: { memberId, year: Number(year) }
        });
        if (existingSub) {
            return res.status(400).json({ error: 'لا يمكن إضافة إعفاء لسنة تم سدادها بالفعل' });
        }

        const exemption = await prisma.memberExemption.create({
            data: { memberId, year: Number(year), reason }
        });

        // Audit Logging
        await prisma.auditLog.create({
            data: {
                userId: req.user.id,
                action: 'CREATE_EXEMPTION',
                entity: 'MemberExemption',
                entityId: exemption.id,
                details: { memberId, year }
            }
        });

        res.status(201).json(exemption);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

router.delete('/exemptions/:id', authMiddleware, checkPermission(['MEMBERS_EDIT']), async (req: any, res) => {
    try {
        const id = req.params.id;
        
        const exemption = await prisma.memberExemption.findUnique({
            where: { id },
            include: { member: { include: { entity: true } } }
        });

        if (!exemption) return res.status(404).json({ error: 'السجل غير موجود' });

        if (req.user.role === 'ENCARGADO' && exemption.member.entity.userId !== req.user.id) {
            return res.status(403).json({ error: 'لا تملك صلاحية تعديل هذا العضو' });
        }

        await prisma.memberExemption.delete({ where: { id } });

        // Audit Logging
        await prisma.auditLog.create({
            data: {
                userId: req.user.id,
                action: 'DELETE_EXEMPTION',
                entity: 'MemberExemption',
                entityId: id,
                details: { memberId: exemption.memberId, year: exemption.year }
            }
        });

        res.status(204).end();
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Smart Filter: Get members who haven't paid for a year
router.get('/due', authMiddleware, checkPermission(['MEMBERS_VIEW']), async (req: any, res) => {
    try {
        const { entityId, year } = req.query;
        if (!entityId || !year) return res.status(400).json({ error: 'entityId and year are required' });

        const members = await service.getDueMembers(req.user, entityId as string, Number(year));
        res.json(members);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Collection: Create/Update batch (Draft or Posted)
router.post('/collect', authMiddleware, checkPermission(['COLLECTS_CREATE']), async (req: any, res) => {
    try {
        const collection = await service.collectSubscriptions(req.user, req.body);
        
        // Notifications for Admins/Responsables
        const targetUsers = await prisma.user.findMany({
            where: { role: { name: { in: ['ADMIN', 'RESPONSABLE'] } } }
        });
        
        if (targetUsers.length > 0) {
            await prisma.notification.createMany({
                data: targetUsers.map(u => ({
                    userId: u.id,
                    title: 'تحصيل اشتراكات جديد',
                    message: `تم إنشاء تحصيل اشتراكات جديد برقم ${collection.id} لـ ${req.body.year || ''} سنة/سنوات.`,
                    type: 'COLLECTION',
                    link: `/subscriptions/collect?id=${collection.id}`
                }))
            });
        }

        res.status(201).json(collection);
    } catch (error: any) {
        console.error('Collect Error:', error);
        res.status(400).json({ error: error.message });
    }
});

router.get('/collections', authMiddleware, checkPermission(['COLLECTS_VIEW']), async (req: any, res) => {
    try {
        const collections = await service.getCollections(req.user);
        res.json(collections);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/collections/:id', authMiddleware, checkPermission(['COLLECTS_VIEW']), async (req: any, res) => {
    try {
        const collection = await service.getCollection(req.user, req.params.id);
        if (!collection) return res.status(404).json({ error: 'Collection not found' });
        res.json(collection);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/collections/:id/unpost', authMiddleware, checkPermission(['COLLECTS_EDIT']), async (req: any, res) => {
    try {
        const updated = await service.unpostCollection(req.params.id, req.user);
        res.json(updated);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

router.delete('/collections/:id', authMiddleware, checkPermission(['COLLECTS_DELETE']), async (req: any, res) => {
    try {
        await service.deleteCollection(req.user, req.params.id);
        res.status(204).end();
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

// Get members for a specific subscription entry
router.get('/entry/:id/members', authMiddleware, async (req, res) => {
    try {
        const subs = await prisma.memberSubscription.findMany({
            where: { journalEntryId: req.params.id },
            include: {
                member: true
            }
        });
        // Unique members by ID and aggregate total amount paid in this entry
        const membersMap = new Map();
        subs.forEach(s => {
            if (s.member) {
                if (!membersMap.has(s.member.id)) {
                    membersMap.set(s.member.id, {
                        ...s.member,
                        totalPaid: Number(s.amount)
                    });
                } else {
                    membersMap.get(s.member.id).totalPaid += Number(s.amount);
                }
            }
        });
        res.json(Array.from(membersMap.values()));
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

import { SubscriptionReportService } from '../../../application/services/SubscriptionReportService';

const pivotService = new SubscriptionReportService();

// Pivot Report
router.get('/reports/pivot', authMiddleware, checkPermission(['REPORTS_PIVOT', 'REPORTS_SUBSCRIPTIONS_VIEW']), async (req: any, res) => {
    try {
        const report = await pivotService.getSubscriptionPivot(req.user);
        res.json(report);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Pivot Report Summary
router.get('/reports/pivot-summary', authMiddleware, checkPermission(['REPORTS_PIVOT', 'REPORTS_SUBSCRIPTIONS_VIEW']), async (req: any, res) => {
    try {
        const { yearFrom, yearTo, entityId } = req.query;
        const filters = {
            yearFrom: yearFrom ? Number(yearFrom) : undefined,
            yearTo: yearTo ? Number(yearTo) : undefined,
            entityId: entityId as string | undefined
        };
        const report = await pivotService.getSubscriptionSummaryPivot(req.user, filters);
        res.json(report);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
