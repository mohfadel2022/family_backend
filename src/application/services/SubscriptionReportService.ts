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
                entity: { include: { currency: true } },
                paymentEntity: { include: { currency: true } },
                subscriptions: {
                    include: {
                        journalEntry: {
                            include: {
                                lines: {
                                    include: {
                                        currency: true
                                    }
                                }
                            }
                        }
                    }
                },
                exemptions: true
            },
            orderBy: { name: 'asc' }
        });

        // 2. Determine the range of years
        const yearsSet = new Set<number>();
        members.forEach(m => {
            m.subscriptions.forEach(s => yearsSet.add(s.year));
            m.exemptions.forEach(e => yearsSet.add(e.year));
            if (m.affiliationYear) yearsSet.add(m.affiliationYear);
            if (m.stoppedAt) yearsSet.add(new Date(m.stoppedAt).getFullYear());
        });
        yearsSet.add(new Date().getFullYear());
        const sortedYears = Array.from(yearsSet).sort((a, b) => a - b);

        // 3. Prepare flat members list with all necessary info for frontend grouping
        const flatMembers = members.map(member => {
            // Calculations for observations
            let observations = '';
            if (member.status === 'DECEASED') {
                const year = member.stoppedAt ? new Date(member.stoppedAt).getFullYear() : '';
                observations = `متوفى ${year ? `(${year})` : ''}`;
            } else if (member.status === 'INACTIVE') {
                const year = member.stoppedAt ? new Date(member.stoppedAt).getFullYear() : '';
                observations = `متوقف ${year ? `(${year})` : ''}`;
            }

            const exemptYears = member.exemptions.map(e => e.year).sort((a, b) => b - a).join(', ');
            if (exemptYears) {
                observations = (observations ? observations + ' | ' : '') + `إعفاء: ${exemptYears}`;
            }

            // Pivot subscriptions
            const subMap: Record<number, any> = {};
            sortedYears.forEach(y => {
                const sub = member.subscriptions.find(s => s.year === y);
                const exempt = member.exemptions.some(e => e.year === y);
                
                if (sub) {
                    const debitLine = sub.journalEntry?.lines?.find(l => Number(l.debit) > 0);
                    const lineCurrency = debitLine?.currency?.symbol;

                    subMap[y] = {
                        amount: Number(sub.amount),
                        symbol: lineCurrency || member.entity.currency.symbol || '$'
                    };
                } else {
                    subMap[y] = exempt ? 0 : null;
                }
            });

            return {
                id: member.id,
                name: member.name,
                status: member.status,
                affiliationYear: member.affiliationYear,
                stoppedAt: member.stoppedAt,
                subscriptions: subMap,
                observations: observations,
                residenceName: member.entity.name,
                paymentName: member.paymentEntity?.name || member.entity.name
            };
        });

        return {
            years: sortedYears,
            members: flatMembers
        };
    }

    async getSubscriptionSummaryPivot(
        user: { id: string, role: string },
        filters?: { yearFrom?: number; yearTo?: number; entityId?: string }
    ) {
        const where: any = {};
        if (user.role === 'ENCARGADO') {
            where.entity = { userId: user.id };
        }
        // Apply entity filter (overrides role filter if admin/responsable)
        if (filters?.entityId) {
            where.entityId = filters.entityId;
        }

        const members = await prisma.member.findMany({ where });

        if (members.length === 0) return [];

        // Collect all relevant years: affiliationYear + stoppedAt years
        const yearsSet = new Set<number>();
        members.forEach(m => {
            if (m.affiliationYear) yearsSet.add(m.affiliationYear);
            if (m.stoppedAt) yearsSet.add(new Date(m.stoppedAt).getFullYear());
        });

        let sortedYears = Array.from(yearsSet).sort((a, b) => a - b);

        // Apply year range filter
        if (filters?.yearFrom) sortedYears = sortedYears.filter(y => y >= filters.yearFrom!);
        if (filters?.yearTo)   sortedYears = sortedYears.filter(y => y <= filters.yearTo!);

        const summary = sortedYears.map(year => {
            // All members affiliated up to this year (cumulative, incl. inactive/deceased)
            const affiliatedByYear = members.filter(m => m.affiliationYear !== null && m.affiliationYear <= year);

            // Active at end of this year: affiliated <= year AND not yet stopped
            const activeByYear = affiliatedByYear.filter(m => {
                if (!m.stoppedAt) return true;
                return new Date(m.stoppedAt).getFullYear() > year;
            });

            // New subscribers: joined exactly this year
            const newMembers = members.filter(m => m.affiliationYear === year);

            // Became inactive this year
            const inactiveThisYear = members.filter(m => {
                if (!m.stoppedAt || m.status !== 'INACTIVE') return false;
                return new Date(m.stoppedAt).getFullYear() === year;
            });

            // Died this year
            const deceasedThisYear = members.filter(m => {
                if (!m.stoppedAt || m.status !== 'DECEASED') return false;
                return new Date(m.stoppedAt).getFullYear() === year;
            });

            const newCount = newMembers.length;
            const inactiveCount = inactiveThisYear.length;
            const deceasedCount = deceasedThisYear.length;

            return {
                year,
                totalMembers: affiliatedByYear.length,   // all ever affiliated up to year
                new: newCount,
                inactive: inactiveCount,
                deceased: deceasedCount,
                difference: newCount - inactiveCount - deceasedCount,
                cumulative: activeByYear.length          // real active count at year-end
            };
        });

        return summary;
    }
}
