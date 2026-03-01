import { Router } from 'express';
import { JournalEntryService } from '../../../application/services/JournalEntryService';
import { authMiddleware } from '../middlewares/authMiddleware';

const router = Router();
const service = new JournalEntryService();

router.post('/', authMiddleware, async (req: any, res) => {
  try {
    const entry = await service.createDraft({
      ...req.body,
      createdBy: req.user.id
    });
    res.status(201).json(entry);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/', authMiddleware, async (req, res) => {
  try {
    const entries = await service.getEntries(
      req.query.branchId as string,
      req.query.type as string
    );
    res.json(entries);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const entry = await service.getEntryById(req.params.id);
    res.json(entry);
  } catch (error: any) {
    res.status(404).json({ error: error.message });
  }
});

router.put('/:id', authMiddleware, async (req: any, res) => {
  try {
    const entry = await service.updateEntry(req.params.id, req.body);
    res.json(entry);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    await service.deleteEntry(req.params.id);
    res.status(204).end();
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/:id/post', authMiddleware, async (req: any, res) => {
  try {
    const entry = await service.postEntry(req.params.id, req.user.id);
    res.json(entry);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/:id/unpost', authMiddleware, async (req: any, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Only admins can unpost entries' });
    }

    const entry = await service.unpostEntry(req.params.id, req.user.id);
    res.json(entry);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

export default router;
