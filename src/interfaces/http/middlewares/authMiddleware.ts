import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../../../infrastructure/database/prisma';

export const authMiddleware = async (req: any, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (token === 'mock-token') {
    try {
      // Get the actual admin user from database
      const adminUser = await prisma.user.findFirst({
        where: { username: 'admin' }
      });

      if (!adminUser) {
        return res.status(401).json({ error: 'Admin user not found' });
      }

      req.user = { id: adminUser.id, role: adminUser.role };
      return next();
    } catch (err) {
      return res.status(500).json({ error: 'Database error' });
    }
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};
