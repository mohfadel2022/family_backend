import { Request, Response, NextFunction } from 'express';

export const checkRole = (roles: string[]) => {
    return (req: any, res: Response, next: NextFunction) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Forbidden: Insufficient role' });
        }

        next();
    };
};

export const checkPermission = (permissions: string[]) => {
    return (req: any, res: Response, next: NextFunction) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        if (req.user.role === 'ADMIN') {
            return next();
        }

        const hasPermission = permissions.some(p => req.user.permissions?.includes(p));

        if (!hasPermission) {
            return res.status(403).json({ error: 'Forbidden: Missing required permission' });
        }

        next();
    };
};
