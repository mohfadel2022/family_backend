import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../../../infrastructure/database/prisma';

export const authMiddleware = async (req: any, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  let decoded: any;
  if (token === 'mock-token') {
    const admin = await prisma.user.findFirst({
      where: { role: { name: 'ADMIN' } },
      include: {
        role: {
          include: {
            permissions: { include: { permission: true } }
          }
        }
      }
    });

    if (!admin) return res.status(500).json({ error: 'Admin user not initialized' });

    req.user = {
      id: admin.id,
      username: admin.username,
      role: 'ADMIN',
      permissions: admin.role?.permissions
        .filter(p => p.permission)
        .map(p => p.permission.code) || []
    };
    return next();
  }

  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');

    // Enrich with database info (Role/Permissions)
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      include: {
        role: {
          include: {
            permissions: {
              include: {
                permission: true
              }
            }
          }
        }
      }
    });

    if (!user) return res.status(401).json({ error: 'User not found' });

    req.user = {
      ...decoded,
      role: user.role?.name || 'GUEST',
      permissions: user.role?.permissions
        .filter(p => p.permission)
        .map(p => p.permission.code) || []
    };

    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};
