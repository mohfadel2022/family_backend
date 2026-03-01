import { Router } from 'express';
import { authMiddleware } from '../middlewares/authMiddleware';
import prisma from '../../../infrastructure/database/prisma';
import { SubscriptionService } from '../../../application/services/SubscriptionService';

const router = Router();
const service = new SubscriptionService();

// Entities CRUD
router.get('/entities', authMiddleware, async (req, res) => {
    try {
        const entities = await prisma.entity.findMany({
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

router.post('/entities', authMiddleware, async (req, res) => {
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

router.put('/entities/:id', authMiddleware, async (req, res) => {
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

router.delete('/entities/:id', authMiddleware, async (req, res) => {
    try {
        await prisma.entity.delete({ where: { id: req.params.id } });
        res.status(204).end();
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

// Members CRUD
router.get('/members', authMiddleware, async (req, res) => {
    try {
        const entityId = req.query.entityId as string;
        const members = await service.getMembers(entityId);
        res.json(members);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/members', authMiddleware, async (req, res) => {
    try {
        console.log('Create Member Body:', req.body);
        const { name, entityId, affiliationYear, stoppedAt, status } = req.body;
        const member = await prisma.member.create({
            data: {
                name: name.trim(),
                entityId,
                affiliationYear: Number(affiliationYear) || new Date().getFullYear(),
                status: (status && status !== 'null') ? status : 'ACTIVE',
                stoppedAt: stoppedAt ? new Date(stoppedAt) : null
            }
        });
        res.status(201).json(member);
    } catch (error: any) {
        console.error('Create Member Error:', error);
        res.status(500).json({ error: error.message });
    }
});

router.put('/members/:id', authMiddleware, async (req, res) => {
    try {
        console.log('Update Member Body:', req.body);
        const { name, entityId, affiliationYear, stoppedAt, status } = req.body;
        const member = await prisma.member.update({
            where: { id: req.params.id },
            data: {
                name: name.trim(),
                entityId,
                affiliationYear: Number(affiliationYear) || new Date().getFullYear(),
                status: (status && status !== 'null') ? status : 'ACTIVE',
                stoppedAt: (stoppedAt && stoppedAt !== 'null') ? new Date(stoppedAt) : null
            }
        });
        res.json(member);
    } catch (error: any) {
        console.error('Update Member Error:', error);
        res.status(500).json({ error: error.message });
    }
});

router.delete('/members/:id', authMiddleware, async (req, res) => {
    try {
        await prisma.member.delete({
            where: { id: req.params.id }
        });
        res.status(204).end();
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Smart Filter: Get members who haven't paid for a year
router.get('/due', authMiddleware, async (req, res) => {
    try {
        const { entityId, year } = req.query;
        if (!entityId || !year) return res.status(400).json({ error: 'entityId and year are required' });

        const members = await service.getDueMembers(entityId as string, Number(year));
        res.json(members);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Collection: Create/Update batch (Draft or Posted)
router.post('/collect', authMiddleware, async (req: any, res) => {
    try {
        const collection = await service.collectSubscriptions({
            ...req.body,
            createdBy: req.user.id
        });
        res.status(201).json(collection);
    } catch (error: any) {
        console.error('Collect Error:', error);
        res.status(400).json({ error: error.message });
    }
});

router.get('/collections', authMiddleware, async (req, res) => {
    try {
        const collections = await service.getCollections();
        res.json(collections);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/collections/:id', authMiddleware, async (req, res) => {
    try {
        const collection = await service.getCollection(req.params.id);
        if (!collection) return res.status(404).json({ error: 'Collection not found' });
        res.json(collection);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/collections/:id/unpost', authMiddleware, async (req: any, res) => {
    try {
        const updated = await service.unpostCollection(req.params.id, req.user.id);
        res.json(updated);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

router.delete('/collections/:id', authMiddleware, async (req, res) => {
    try {
        await service.deleteCollection(req.params.id);
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
        res.json(subs.map(s => s.member));
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
