import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { authMiddleware } from '../middlewares/authMiddleware';
import prisma from '../../../infrastructure/database/prisma';
import { checkPermission } from '../middlewares/roleMiddleware';
import fs from 'fs';
import { promisify } from 'util';

const unlinkAsync = promisify(fs.unlink);

const router = Router();

// Configure multer storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ storage });

// Single file upload
router.post('/', authMiddleware, checkPermission(['VOUCHERS_CREATE', 'VOUCHERS_EDIT']), async (req: any, res) => {
    // TEMPORARILY DISABLED FOR NETLIFY DEPLOYMENT
    res.status(503).json({ error: 'La subida de archivos está temporalmente desactivada.' });
});

// Link attachment to journal entry
router.post('/link', authMiddleware, checkPermission(['VOUCHERS_EDIT']), async (req: any, res) => {
    const { journalEntryId, fileName, fileUrl, fileType, fileSize } = req.body;

    if (!journalEntryId || !fileUrl) {
        return res.status(400).json({ error: 'Missing journalEntryId or fileUrl' });
    }

    try {
        // Enforce ownership if Encargado
        if (req.user.role === 'ENCARGADO') {
            const entry = await prisma.journalEntry.findUnique({
                where: { id: journalEntryId },
                include: { memberSubscriptions: { include: { member: { include: { entity: true } } } } }
            });
            if (!entry) return res.status(404).json({ error: 'Voucher not found' });

            const isOwner = entry.createdBy === req.user.id;
            const isLinkedToManagedEntity = entry.memberSubscriptions.some(
                (s: any) => s.member.entity.userId === req.user.id
            );
            if (!isOwner && !isLinkedToManagedEntity) {
                return res.status(403).json({ error: 'Forbidden: You do not have access to this voucher' });
            }
        }
        const attachment = await prisma.attachment.create({
            data: {
                journalEntryId,
                fileName,
                fileUrl,
                fileType,
                fileSize
            }
        });

        res.status(201).json(attachment);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Delete file by URL (for files not yet linked to an attachment record)
router.post('/delete-binary', authMiddleware, checkPermission(['VOUCHERS_CREATE', 'VOUCHERS_EDIT']), async (req: any, res) => {
    // TEMPORARILY DISABLED FOR NETLIFY DEPLOYMENT
    res.status(503).json({ error: 'La eliminación de archivos físicos está temporalmente desactivada.' });
});

// Delete attachment
router.delete('/:id', authMiddleware, checkPermission(['VOUCHERS_EDIT', 'VOUCHERS_DELETE']), async (req: any, res) => {
    try {
        const attachment = await prisma.attachment.findUnique({
            where: { id: req.params.id },
            include: { journalEntry: { include: { memberSubscriptions: { include: { member: { include: { entity: true } } } } } } }
        });

        if (!attachment) return res.status(404).json({ error: 'Attachment not found' });

        if (req.user.role === 'ENCARGADO' && attachment.journalEntry) {
            const entry = attachment.journalEntry;
            const isOwner = entry.createdBy === req.user.id;
            const isLinkedToManagedEntity = entry.memberSubscriptions.some(
                (s: any) => s.member.entity.userId === req.user.id
            );
            if (!isOwner && !isLinkedToManagedEntity) {
                return res.status(403).json({ error: 'Forbidden: You do not have access to this attachment' });
            }
        }

        // Physical file deletion - DISABLED
        // if (attachment.fileUrl) {
        //     const filePath = path.join(process.cwd(), attachment.fileUrl.startsWith('/') ? attachment.fileUrl.substring(1) : attachment.fileUrl);
        //     if (fs.existsSync(filePath)) {
        //         await unlinkAsync(filePath).catch(err => console.error(`Failed to delete file: ${filePath}`, err));
        //     }
        // }

        await prisma.attachment.delete({
            where: { id: req.params.id }
        });
        res.status(204).send();
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
