import prisma from '../../infrastructure/database/prisma';
import { EntryStatus } from '@prisma/client';

export class DashboardService {
    async getSummary(user: { id: string, role: string, id_user?: string }, branchId?: string, year?: number, entityId?: string) {
        const selectedYear = year || new Date().getFullYear();
        const startOfYear = new Date(selectedYear, 0, 1);
        const endOfYear = new Date(selectedYear, 11, 31, 23, 59, 59);

        const whereBranch: any = branchId ? { branchId } : {};

        // ──────────────────────────────────────────────
        // 0. ENTITY BREAKDOWN CALCULATIONS
        // ──────────────────────────────────────────────
        // Get all entities to group data
        const allSystemEntities = await prisma.entity.findMany({ select: { id: true, name: true } });
        const entitiesById = new Map(allSystemEntities.map(e => [e.id, e]));

        // ──────────────────────────────────────────────
        // 1. MEMBERSHIP STATS
        // ──────────────────────────────────────────────
        let membershipStats: any = null;

        let entityWhere: any = {};
        if (user.role === 'ENCARGADO') {
            entityWhere = { userId: user.id };
        } else if (entityId) {
            entityWhere = { id: entityId };
        }

        const scopeEntities = await prisma.entity.findMany({ where: entityWhere });
        const scopeEntityIds = scopeEntities.map(e => e.id);
        const entityName = (user.role === 'ENCARGADO' || entityId) && scopeEntities.length > 0 ? scopeEntities[0].name : null;

        if (user.role === 'ADMIN' || user.role === 'RESPONSABLE' || user.role === 'ENCARGADO') {
            const memberWhere: any = {};
            if (user.role === 'ENCARGADO' || entityId) {
                memberWhere.entityId = { in: scopeEntityIds };
            }

            const allMembers = await prisma.member.findMany({
                where: memberWhere,
                include: {
                    subscriptions: {
                        include: {
                            journalEntry: {
                                include: {
                                    lines: {
                                        where: { baseDebit: { gt: 0 } },
                                        take: 1,
                                        include: { currency: true }
                                    }
                                }
                            }
                        }
                    },
                    exemptions: true
                }
            });

            const membersInYear = allMembers.filter(m => m.affiliationYear <= selectedYear);
            const totalMembers = membersInYear.length;

            // Historical Status Logic: 
            // A member is ACTIVE in selectedYear if they joined by then AND (not stopped OR stopped after selectedYear)
            const activeInYear = membersInYear.filter(m => {
                const stoppedYear = m.stoppedAt ? new Date(m.stoppedAt).getFullYear() : Infinity;
                return stoppedYear > selectedYear;
            });

            const activeMembers = activeInYear.length;

            const inactiveMembers = membersInYear.filter(m => {
                const stoppedYear = m.stoppedAt ? new Date(m.stoppedAt).getFullYear() : Infinity;
                return stoppedYear <= selectedYear && m.status === 'INACTIVE';
            }).length;

            const deceasedMembers = membersInYear.filter(m => {
                const stoppedYear = m.stoppedAt ? new Date(m.stoppedAt).getFullYear() : Infinity;
                return stoppedYear <= selectedYear && m.status === 'DECEASED';
            }).length;

            const membersDue = activeInYear.filter(m =>
                !m.subscriptions.some(s => s.year === selectedYear) &&
                !m.exemptions.some(e => e.year === selectedYear)
            ).length;

            const membersPaid = activeInYear.filter(m =>
                m.subscriptions.some(s => s.year === selectedYear) ||
                m.exemptions.some(e => e.year === selectedYear)
            ).length;

            const totalSubscribers = allMembers.filter(m => m.subscriptions.length > 0).length;

            // Entity Breakdown for Membership
            const membershipBreakdown: any[] = [];
            for (const ent of allSystemEntities) {
                const entMembers = membersInYear.filter(m => m.entityId === ent.id);
                if (entMembers.length === 0) continue;

                const entActiveInYear = entMembers.filter(m => {
                    const stoppedYear = m.stoppedAt ? new Date(m.stoppedAt).getFullYear() : Infinity;
                    return stoppedYear > selectedYear;
                });

                membershipBreakdown.push({
                    entityId: ent.id,
                    entityName: ent.name,
                    total: entMembers.length,
                    active: entActiveInYear.length,
                    due: entActiveInYear.filter(m =>
                        !m.subscriptions.some(s => s.year === selectedYear) &&
                        !m.exemptions.some(e => e.year === selectedYear)
                    ).length,
                    paid: entActiveInYear.filter(m =>
                        m.subscriptions.some(s => s.year === selectedYear) ||
                        m.exemptions.some(e => e.year === selectedYear)
                    ).length
                });
            }

            const pendingPaymentsByYear = [];
            let minYear = Math.min(...allMembers.map(m => m.affiliationYear || selectedYear), selectedYear);

            for (let y = minYear; y <= selectedYear; y++) {
                let expected = 0;
                let paid = 0;
                let activeAndPaid = 0;
                for (const m of allMembers) {
                    if (m.affiliationYear <= y) {
                        const stoppedYear = m.stoppedAt ? new Date(m.stoppedAt).getFullYear() : Infinity;
                        const isActive = y < stoppedYear;
                        const hasPaid = m.subscriptions.some(s => s.year === y);
                        const isExempt = m.exemptions.some(e => e.year === y);

                        if (isActive) {
                            expected++;
                            if (hasPaid || isExempt) {
                                paid++;
                                activeAndPaid++;
                            }
                        } else if (hasPaid || isExempt) {
                            paid++;
                        }
                    }
                }
                const pending = expected - activeAndPaid;
                if (expected > 0 || paid > 0) {
                    pendingPaymentsByYear.push({ year: y, pending, paid, expected });
                }
            }
            pendingPaymentsByYear.sort((a, b) => b.year - a.year);

            const subscriptionsByYearMap = new Map<number, {
                amountBase: number,
                memberIds: Set<string>,
                currencies: Map<string, { amount: number, symbol: string }>
            }>();

            for (const m of allMembers) {
                for (const s of m.subscriptions) {
                    const existing = subscriptionsByYearMap.get(s.year) || {
                        amountBase: 0,
                        memberIds: new Set<string>(),
                        currencies: new Map<string, { amount: number, symbol: string }>()
                    };

                    const line = s.journalEntry?.lines?.[0];
                    const rate = Number(line?.exchangeRate || 1);
                    const baseAmt = Number(s.amount) * rate;
                    const currencyCode = line?.currency?.code || 'UNKNOWN';
                    const currencySymbol = line?.currency?.symbol || '';

                    existing.memberIds.add(m.id);
                    existing.amountBase += baseAmt;

                    const curr = existing.currencies.get(currencyCode) || { amount: 0, symbol: currencySymbol };
                    curr.amount += Number(s.amount);
                    existing.currencies.set(currencyCode, curr);

                    subscriptionsByYearMap.set(s.year, existing);
                }
            }
            const subscriptionsByYear = Array.from(subscriptionsByYearMap.entries())
                .map(([year, data]) => ({
                    year,
                    amountBase: data.amountBase,
                    memberCount: data.memberIds.size,
                    currencies: Array.from(data.currencies.entries()).map(([code, c]) => ({
                        code,
                        amount: c.amount,
                        symbol: c.symbol
                    }))
                }))
                .sort((a, b) => b.year - a.year)
                .slice(0, 5);

            const monthlySubscriptions = new Array(12).fill(0);
            const collectionsInYear = await prisma.memberSubscription.findMany({
                where: {
                    memberId: { in: allMembers.map(m => m.id) },
                    journalEntry: {
                        date: { gte: startOfYear, lte: endOfYear },
                        status: EntryStatus.POSTED
                    }
                },
                select: { amount: true, journalEntry: { select: { date: true } } }
            });
            for (const sub of (collectionsInYear as any)) {
                if (!sub.journalEntry) continue;
                const month = new Date(sub.journalEntry.date).getMonth();
                monthlySubscriptions[month] += Number(sub.amount || 0);
            }

            const totalSubscribersBreakdown: any[] = [];
            for (const ent of allSystemEntities) {
                const entSubscribers = allMembers.filter(m => m.entityId === ent.id && m.subscriptions.length > 0);
                if (entSubscribers.length === 0) continue;
                totalSubscribersBreakdown.push({
                    entityId: ent.id,
                    entityName: ent.name,
                    total: entSubscribers.length
                });
            }

            membershipStats = {
                totalMembers: totalMembers || 0,
                activeMembers: activeMembers || 0,
                inactiveMembers: inactiveMembers || 0,
                deceasedMembers: deceasedMembers || 0,
                membersDue: membersDue || 0,
                membersPaid: membersPaid || 0,
                totalSubscribers: totalSubscribers || 0,
                totalSubscribersBreakdown,
                pendingPaymentsByYear: pendingPaymentsByYear || [],
                subscriptionsByYear: subscriptionsByYear || [],
                monthlySubscriptions: monthlySubscriptions || new Array(12).fill(0),
                entityName: entityName || null,
                selectedYear: selectedYear,
                breakdown: membershipBreakdown
            };
        }

        // Financial filter logic
        let financialEntryFilter: any = {};
        if (user.role === 'ENCARGADO') {
            financialEntryFilter = {
                OR: [
                    { createdBy: user.id },
                    { memberSubscriptions: { some: { member: { entity: { userId: user.id } } } } }
                ]
            };
        } else if (entityId) {
            financialEntryFilter = {
                memberSubscriptions: { some: { member: { entityId: entityId } } }
            };
        }

        // ──────────────────────────────────────────────
        // 1. ASSET BALANCES
        // ──────────────────────────────────────────────
        const assetLines = await prisma.journalLine.findMany({
            where: {
                account: { type: 'ASSET', ...whereBranch },
                journalEntry: { status: EntryStatus.POSTED, ...financialEntryFilter }
            },
            select: {
                debit: true,
                credit: true,
                baseDebit: true,
                baseCredit: true,
                currencyId: true,
                currency: { select: { code: true, symbol: true } }
            }
        });

        const assetMap = new Map<string, { code: string; symbol: string; balance: number; balanceBase: number }>();
        let totalAssetsBase = 0;

        for (const line of assetLines) {
            if (!line.currency) continue;
            const key = line.currencyId;
            const existing = assetMap.get(key) || { code: line.currency.code, symbol: line.currency.symbol, balance: 0, balanceBase: 0 };
            existing.balance += Number(line.debit || 0) - Number(line.credit || 0);
            existing.balanceBase += Number(line.baseDebit || 0) - Number(line.baseCredit || 0);
            assetMap.set(key, existing);

            const lineBalanceBase = Number(line.baseDebit || 0) - Number(line.baseCredit || 0);
            totalAssetsBase += lineBalanceBase;

            // Group assets by entity using journal entry tagging logic
            // In this system, entries for members are linked to entities.
            // We need to check if the entry has memberSubscriptions
        }

        // To properly breakdown financial data by entity, we need to join with member info
        // Since asset lines are generic (Cash/Bank), we infer entity from memberSubscriptions or entry description/metadata if available.
        // HOWEVER, a better way is to check the account branch if branch == entity (common pattern here).
        // Let's check the schema if Entity links to Branch or if we can use the memberSubscriptions relation.


        const allAssetAccounts = await prisma.account.findMany({
            where: { type: 'ASSET', ...whereBranch },
            include: { currency: { select: { symbol: true } } }
        });

        // 1. Calculate individual balances for all asset accounts
        const accountBalances = new Map<string, { id: string, name: string, parentId: string | null, balance: number, originalBalance: number, symbol: string }>();
        
        for (const acc of allAssetAccounts) {
            accountBalances.set(acc.id, {
                id: acc.id,
                name: acc.name,
                parentId: acc.parentId,
                balance: 0,
                originalBalance: 0,
                symbol: acc.currency?.symbol || ''
            });
        }

        const assetLinesWithAccounts = await prisma.journalLine.findMany({
            where: {
                account: { type: 'ASSET', ...whereBranch },
                journalEntry: { status: EntryStatus.POSTED, ...financialEntryFilter }
            },
            include: {
                account: { select: { id: true } }
            }
        });

        for (const line of assetLinesWithAccounts) {
            const acc = accountBalances.get(line.accountId);
            if (acc) {
                acc.balance += Number(line.baseDebit || 0) - Number(line.baseCredit || 0);
                acc.originalBalance += Number(line.debit || 0) - Number(line.credit || 0);
            }
        }

        // 2. Aggregate balances upwards
        // We need to make sure each account contributes to all its ancestors
        const finalAccountMap = new Map<string, { name: string, balance: number, originalBalance: number, symbol: string, level: number, isParent: boolean }>();
        
        for (const acc of allAssetAccounts) {
            const bal = accountBalances.get(acc.id)!;
            
            // Add this balance to the account itself and all its ancestors
            let currentId: string | null = acc.id;
            const visited = new Set<string>(); // Prevent cycles just in case
            
            while (currentId && !visited.has(currentId)) {
                visited.add(currentId);
                const currentAcc = allAssetAccounts.find(a => a.id === currentId);
                if (!currentAcc) break;

                const existing = finalAccountMap.get(currentAcc.id) || { 
                    name: currentAcc.name, 
                    balance: 0, 
                    originalBalance: 0, 
                    symbol: currentAcc.currency?.symbol || '',
                    level: 0, // We'll compute level if needed
                    isParent: allAssetAccounts.some(a => a.parentId === currentAcc.id) 
                };
                
                // Only root accounts or specific level accounts contribute to the balance sum of ancestors? 
                // No, each leaf's balance should be added once to each ancestor.
                // Wait, if I add every account's balance to its ancestors, and I have entries at multiple levels, it works.
                existing.balance += bal.balance;
                // Original balance is tricky if multiple currencies are mixed in a group. 
                // We'll only show original balance if the group has a consistent currency, otherwise we hide it in UI.
                existing.originalBalance += bal.originalBalance; 
                
                finalAccountMap.set(currentAcc.id, existing);
                currentId = currentAcc.parentId;
            }
        }

        // 3. Build a forest (multiple trees) of asset accounts
        const buildTree = (accountId: string): any => {
            const acc = allAssetAccounts.find(a => a.id === accountId);
            if (!acc) return null;

            const groupedData = finalAccountMap.get(acc.id)!;
            const children = allAssetAccounts
                .filter(a => a.parentId === acc.id)
                .map(a => buildTree(a.id))
                .filter(Boolean)
                .sort((a, b) => b.balance - a.balance);

            return {
                name: acc.name,
                balance: groupedData.balance,
                originalBalance: groupedData.originalBalance,
                symbol: groupedData.symbol,
                children: children.length > 0 ? children : undefined
            };
        };

        // Identify root accounts (those with no parent in the ASSET tree)
        const rootAssets = allAssetAccounts.filter(acc => !acc.parentId || !allAssetAccounts.some(a => a.id === acc.parentId));
        
        let displayAccounts: any[] = [];
        
        // If there's only one root (e.g., "Assets"), it's more useful to show its direct children as the top level
        if (rootAssets.length === 1) {
            const childrenOfRoot = allAssetAccounts.filter(acc => acc.parentId === rootAssets[0].id);
            if (childrenOfRoot.length > 0) {
                displayAccounts = childrenOfRoot.map(acc => buildTree(acc.id));
            } else {
                displayAccounts = [buildTree(rootAssets[0].id)];
            }
        } else {
            displayAccounts = rootAssets.map(root => buildTree(root.id));
        }

        const assetsBreakdown = displayAccounts.sort((a, b) => b.balance - a.balance);

        const assetsByCurrency = Array.from(assetMap.values()).filter(a => Math.abs(a.balance) > 0.001);

        // ──────────────────────────────────────────────
        // 2. FINANCIAL PERFORMANCE (Selected Year)
        // ──────────────────────────────────────────────
        const baseCurrency = await prisma.currency.findFirst({ where: { isBase: true } });
        const baseCurrencyCode = baseCurrency?.code || 'SAR';
        const baseCurrencySymbol = baseCurrency?.symbol || 'ر.س';

        const monthlyRevenue = new Array(12).fill(0);
        const monthlyExpensesArr = new Array(12).fill(0);

        const revLines = await prisma.journalLine.findMany({
            where: {
                account: { type: 'REVENUE', ...whereBranch },
                journalEntry: {
                    date: { gte: startOfYear, lte: endOfYear },
                    status: EntryStatus.POSTED,
                    ...financialEntryFilter
                }
            },
            select: { baseDebit: true, baseCredit: true, journalEntry: { select: { date: true } } }
        });
        for (const l of revLines) {
            if (!l.journalEntry) continue;
            const month = new Date(l.journalEntry.date).getMonth();
            monthlyRevenue[month] += Number(l.baseCredit || 0) - Number(l.baseDebit || 0);
        }

        const expLines = await prisma.journalLine.findMany({
            where: {
                account: { type: 'EXPENSE', ...whereBranch },
                journalEntry: {
                    date: { gte: startOfYear, lte: endOfYear },
                    status: EntryStatus.POSTED,
                    ...financialEntryFilter
                }
            },
            select: { baseDebit: true, baseCredit: true, journalEntry: { select: { date: true } } }
        });
        for (const l of expLines) {
            if (!l.journalEntry) continue;
            const month = new Date(l.journalEntry.date).getMonth();
            monthlyExpensesArr[month] += Number(l.baseDebit || 0) - Number(l.baseCredit || 0);
        }

        const totalYearRevenue = monthlyRevenue.reduce((a, b) => a + b, 0);
        const totalYearExpenses = monthlyExpensesArr.reduce((a, b) => a + b, 0);

        // Revenue/Expense by Currency for card display
        // Always use yearly range to match the labels (Yearly Revenue/Expenses)
        const cardRevWhere = { date: { gte: startOfYear, lte: endOfYear } };

        const revenueByAccountRaw = await prisma.journalLine.findMany({
            where: {
                account: { type: 'REVENUE', ...whereBranch },
                journalEntry: { ...cardRevWhere, status: EntryStatus.POSTED, ...financialEntryFilter }
            },
            include: { currency: true, account: { select: { name: true } } }
        });
        const revMap = new Map<string, { code: string; symbol: string; total: number; totalBase: number }>();
        const revBreakdownMap = new Map<string, { name: string, total: number, originalTotal: number, symbol: string }>();
        for (const l of revenueByAccountRaw) {
            if (l.currency) {
                const key = l.currencyId;
                const existing = revMap.get(key) || { code: l.currency.code, symbol: l.currency.symbol, total: 0, totalBase: 0 };
                const balanceOriginal = Number(l.credit || 0) - Number(l.debit || 0);
                const balanceBase = Number(l.baseCredit || 0) - Number(l.baseDebit || 0);
                existing.total += balanceOriginal;
                existing.totalBase += balanceBase;
                revMap.set(key, existing);
            }

            const accName = l.account.name;
            const current = revBreakdownMap.get(accName) || { name: accName, total: 0, originalTotal: 0, symbol: l.currency?.symbol || '' };
            current.total += Number(l.baseCredit || 0) - Number(l.baseDebit || 0);
            current.originalTotal += Number(l.credit || 0) - Number(l.debit || 0);
            revBreakdownMap.set(accName, current);
        }
        const revenueByCurrency = Array.from(revMap.values());
        const revenueBreakdown = Array.from(revBreakdownMap.values()).filter(a => Math.abs(a.total) > 0.001).sort((a, b) => b.total - a.total);

        const expenseByAccountRaw = await prisma.journalLine.findMany({
            where: {
                account: { type: 'EXPENSE', ...whereBranch },
                journalEntry: { ...cardRevWhere, status: EntryStatus.POSTED, ...financialEntryFilter }
            },
            include: { currency: true, account: { select: { name: true } } }
        });
        const expCurrencyMap = new Map<string, { code: string; symbol: string; total: number; totalBase: number }>();
        const expBreakdownMap = new Map<string, { name: string, total: number, originalTotal: number, symbol: string }>();
        for (const l of expenseByAccountRaw) {
            if (l.currency) {
                const balanceOriginal = Number(l.debit || 0) - Number(l.credit || 0);
                const balanceBase = Number(l.baseDebit || 0) - Number(l.baseCredit || 0);

                const key = l.currencyId;
                const existing = expCurrencyMap.get(key) || { code: l.currency.code, symbol: l.currency.symbol, total: 0, totalBase: 0 };
                existing.total += balanceOriginal;
                existing.totalBase += balanceBase;
                expCurrencyMap.set(key, existing);
            }

            const accName = l.account.name;
            const current = expBreakdownMap.get(accName) || { name: accName, total: 0, originalTotal: 0, symbol: l.currency?.symbol || '' };
            current.total += Number(l.baseDebit || 0) - Number(l.baseCredit || 0);
            current.originalTotal += Number(l.debit || 0) - Number(l.credit || 0);
            expBreakdownMap.set(accName, current);
        }
        const expenseByCurrency = Array.from(expCurrencyMap.values());
        const expenseBreakdownEntities = Array.from(expBreakdownMap.values()).filter(a => Math.abs(a.total) > 0.001).sort((a, b) => b.total - a.total);
        console.log(`- Revenue/Expense by Currency calculated.`);

        // Recent Transactions
        const recentEntries = await prisma.journalEntry.findMany({
            where: { ...whereBranch, status: EntryStatus.POSTED, ...financialEntryFilter },
            orderBy: [{ date: 'desc' }, { entryNumber: 'desc' }],
            take: 10,
            include: {
                branch: { select: { name: true } },
                lines: { take: 1, include: { currency: true } }
            }
        });
        const recentTransactions = recentEntries.map((entry: any) => {
            const primaryLine = entry.lines[0];
            return {
                ...entry,
                originalAmount: primaryLine ? (Number(primaryLine.debit || 0) || Number(primaryLine.credit || 0)) : Number(entry.totalAmount || 0),
                baseAmount: primaryLine ? (Number(primaryLine.baseDebit || 0) || Number(primaryLine.baseCredit || 0)) : Number(entry.totalAmount || 0),
                currencyCode: primaryLine?.currency?.code || baseCurrencyCode,
                currencySymbol: primaryLine?.currency?.symbol || baseCurrencySymbol
            };
        });

        // Expense Breakdown (Using findMany + reduce instead of aggregate with relation filter)
        const allExpenseAccounts = await prisma.account.findMany({ where: { type: 'EXPENSE' } });
        const expenseAccountIdsArr = allExpenseAccounts.map(a => a.id);
        const expenseAccountIdsSet = new Set(expenseAccountIdsArr);
        const topLevelCategories = allExpenseAccounts.filter(a => !a.parentId || !expenseAccountIdsSet.has(a.parentId));

        let expenseBreakdown: any[] = [];
        const categoriesToShow = topLevelCategories.length === 1 ? allExpenseAccounts.filter(a => a.parentId === topLevelCategories[0].id) : topLevelCategories;

        // Fetch all expense lines for this year once to avoid multiple db hits
        const allExpLinesThisYear = await prisma.journalLine.findMany({
            where: {
                accountId: { in: expenseAccountIdsArr },
                journalEntry: { date: { gte: startOfYear, lte: endOfYear }, status: EntryStatus.POSTED, ...financialEntryFilter }
            },
            select: { accountId: true, baseDebit: true, baseCredit: true }
        });

        for (const [index, cat] of categoriesToShow.entries()) {
            const descIds = new Set([cat.id]);
            const findChildren = (pid: string) => {
                const children = allExpenseAccounts.filter(a => a.parentId === pid);
                for (const c of children) { descIds.add(c.id); findChildren(c.id); }
            };
            findChildren(cat.id);

            const val = allExpLinesThisYear
                .filter(l => descIds.has(l.accountId))
                .reduce((acc, l) => acc + (Number(l.baseDebit) || 0) - (Number(l.baseCredit) || 0), 0);

            if (Math.abs(val) > 0.001) expenseBreakdown.push({ name: cat.name, value: val, color: getColorForIndex(index) });
        }
        console.log(`- Expense Breakdown calculated for ${expenseBreakdown.length} items.`);

        return {
            selectedYear: selectedYear || new Date().getFullYear(),
            totalLiquidity: totalAssetsBase || 0,
            monthlyIncome: (totalYearRevenue || 0) / 12,
            monthlyExpenses: (totalYearExpenses || 0) / 12,
            yearRevenue: totalYearRevenue || 0,
            yearExpenses: totalYearExpenses || 0,
            netIncome: (totalYearRevenue || 0) - (totalYearExpenses || 0),

            // Monthly Trend Data
            financialTrend: (monthlyRevenue || new Array(12).fill(0)).map((rev, i) => ({
                month: i + 1,
                income: rev || 0,
                expense: (monthlyExpensesArr || [])[i] || 0,
                profit: (rev || 0) - ((monthlyExpensesArr || [])[i] || 0)
            })),

            assetsByCurrency: assetsByCurrency || [],
            assetsBreakdown: assetsBreakdown || [],
            revenueByCurrency: revenueByCurrency || [],
            revenueBreakdown: revenueBreakdown || [],
            expenseByCurrency: expenseByCurrency || [],
            expenseBreakdownEntities: expenseBreakdownEntities || [],
            recentTransactions: recentTransactions || [],
            expenseBreakdown: expenseBreakdown || [],
            baseCurrencyCode: baseCurrencyCode || '---',
            baseCurrencySymbol: baseCurrencySymbol || '',
            role: user?.role || 'GUEST',
            membershipStats: membershipStats || null
        };
    }
}

function getColorForIndex(index: number) {
    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];
    return colors[index % colors.length];
}
