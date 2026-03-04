import prisma from '../../infrastructure/database/prisma';

export class SubscriptionReportService {
    async getSubscriptionPivot(user: { id: string, role: string }) {
        // 1. Fetch all members with their subscriptions and entity
        const where: any = {};
        if (user.role === 'ENCARGADO') {
            where.entity = { userId: user.id };
        }

        const members = await prisma.member.findMany({
            where,
            include: {
                entity: true,
                subscriptions: true
            },
            orderBy: [
                { entity: { name: 'asc' } },
                { name: 'asc' }
            ]
        });

        // 2. Determine the range of years
        const yearsSet = new Set<number>();
        members.forEach(m => {
            m.subscriptions.forEach(s => yearsSet.add(s.year));
            if (m.affiliationYear) yearsSet.add(m.affiliationYear);
            if (m.stoppedAt) yearsSet.add(new Date(m.stoppedAt).getFullYear());
        });

        // Add current year just in case
        yearsSet.add(new Date().getFullYear());

        const sortedYears = Array.from(yearsSet).sort((a, b) => a - b);

        // 3. Group by Entity
        const entitiesMap = new Map();

        members.forEach(member => {
            const entityName = member.entity.name;
            if (!entitiesMap.has(entityName)) {
                entitiesMap.set(entityName, {
                    entityName: entityName,
                    members: []
                });
            }

            // Calculations for observations
            let observations = '';
            if (member.status === 'DECEASED') {
                const year = member.stoppedAt ? new Date(member.stoppedAt).getFullYear() : '';
                observations = `متوفى ${year ? `(${year})` : ''}`;
            } else if (member.status === 'INACTIVE') {
                const year = member.stoppedAt ? new Date(member.stoppedAt).getFullYear() : '';
                observations = `متوقف ${year ? `(${year})` : ''}`;
            }

            // Pivot subscriptions
            const subMap: Record<number, number | null> = {};
            sortedYears.forEach(y => {
                const sub = member.subscriptions.find(s => s.year === y);
                subMap[y] = sub ? Number(sub.amount) : null;
            });

            entitiesMap.get(entityName).members.push({
                id: member.id,
                name: member.name,
                status: member.status,
                affiliationYear: member.affiliationYear,
                stoppedAt: member.stoppedAt,
                subscriptions: subMap,
                observations: observations
            });
        });

        return {
            years: sortedYears,
            data: Array.from(entitiesMap.values())
        };
    }
}
