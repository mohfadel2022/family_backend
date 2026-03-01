import prisma from '../../infrastructure/database/prisma';
import { EntryStatus } from '@prisma/client';

export class DashboardService {
    async getSummary(branchId?: string) {
        const whereBranch = branchId ? { branchId } : {};

        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

        const monthlyEntryWhere = {
            date: { gte: startOfMonth, lte: endOfMonth },
            status: EntryStatus.POSTED,
            ...(branchId ? { branchId } : {})
        };

        // ──────────────────────────────────────────────
        // 1. ASSET BALANCES by Currency (all-time, POSTED only)
        // ──────────────────────────────────────────────
        const assetLines = await prisma.journalLine.findMany({
            where: {
                account: { type: 'ASSET', ...whereBranch },
                journalEntry: { status: EntryStatus.POSTED }
            },
            select: {
                debit: true,
                credit: true,
                currencyId: true,
                currency: { select: { code: true, symbol: true } }
            }
        });

        const assetMap = new Map<string, { code: string; symbol: string; balance: number }>();
        for (const line of assetLines) {
            const key = line.currencyId;
            const existing = assetMap.get(key) || { code: line.currency.code, symbol: line.currency.symbol, balance: 0 };
            existing.balance += Number(line.debit) - Number(line.credit);
            assetMap.set(key, existing);
        }
        const assetsByCurrency = Array.from(assetMap.values()).filter(a => Math.abs(a.balance) > 0.001);

        // Also compute a single base-currency total for backward compat
        const totalLiquidity = assetLines.reduce((sum, l) => {
            // We use debit-credit for base currency if needed, but let's recalc from baseDebit/baseCredit
            return sum;
        }, 0);

        // Actually compute base-currency total from baseDebit/baseCredit
        const assetBaseLine = await prisma.journalLine.aggregate({
            where: {
                account: { type: 'ASSET', ...whereBranch },
                journalEntry: { status: EntryStatus.POSTED }
            },
            _sum: { baseDebit: true, baseCredit: true }
        });
        const totalAssetsBase = (Number(assetBaseLine._sum.baseDebit) || 0) - (Number(assetBaseLine._sum.baseCredit) || 0);

        // ──────────────────────────────────────────────
        // 2. REVENUE TOTALS by Currency (current month, POSTED)
        // ──────────────────────────────────────────────
        const revenueLines = await prisma.journalLine.findMany({
            where: {
                account: { type: 'REVENUE', ...whereBranch },
                journalEntry: monthlyEntryWhere
            },
            select: {
                debit: true,
                credit: true,
                currencyId: true,
                currency: { select: { code: true, symbol: true } }
            }
        });

        const revenueMap = new Map<string, { code: string; symbol: string; total: number }>();
        for (const line of revenueLines) {
            const key = line.currencyId;
            const existing = revenueMap.get(key) || { code: line.currency.code, symbol: line.currency.symbol, total: 0 };
            existing.total += Number(line.credit) - Number(line.debit); // Revenue = credit - debit
            revenueMap.set(key, existing);
        }
        const revenueByCurrency = Array.from(revenueMap.values()).filter(r => Math.abs(r.total) > 0.001);

        // Base currency total
        const revenueBaseLine = await prisma.journalLine.aggregate({
            where: {
                account: { type: 'REVENUE', ...whereBranch },
                journalEntry: monthlyEntryWhere
            },
            _sum: { baseCredit: true, baseDebit: true }
        });
        const monthlyIncome = (Number(revenueBaseLine._sum.baseCredit) || 0) - (Number(revenueBaseLine._sum.baseDebit) || 0);

        // ──────────────────────────────────────────────
        // 3. EXPENSE TOTALS by Currency (current month, POSTED)
        // ──────────────────────────────────────────────
        const expenseLines = await prisma.journalLine.findMany({
            where: {
                account: { type: 'EXPENSE', ...whereBranch },
                journalEntry: monthlyEntryWhere
            },
            select: {
                debit: true,
                credit: true,
                currencyId: true,
                currency: { select: { code: true, symbol: true } }
            }
        });

        const expenseMap = new Map<string, { code: string; symbol: string; total: number }>();
        for (const line of expenseLines) {
            const key = line.currencyId;
            const existing = expenseMap.get(key) || { code: line.currency.code, symbol: line.currency.symbol, total: 0 };
            existing.total += Number(line.debit) - Number(line.credit); // Expense = debit - credit
            expenseMap.set(key, existing);
        }
        const expenseByCurrency = Array.from(expenseMap.values()).filter(e => Math.abs(e.total) > 0.001);

        // Base currency total
        const expenseBaseLine = await prisma.journalLine.aggregate({
            where: {
                account: { type: 'EXPENSE', ...whereBranch },
                journalEntry: monthlyEntryWhere
            },
            _sum: { baseDebit: true, baseCredit: true }
        });
        const monthlyExpenses = (Number(expenseBaseLine._sum.baseDebit) || 0) - (Number(expenseBaseLine._sum.baseCredit) || 0);

        // ──────────────────────────────────────────────
        // 4. Base Currency
        // ──────────────────────────────────────────────
        const baseCurrency = await prisma.currency.findFirst({ where: { isBase: true } });
        const baseCurrencyCode = baseCurrency?.code || 'SAR';
        const baseCurrencySymbol = baseCurrency?.symbol || 'ر.س';

        // ──────────────────────────────────────────────
        // 5. Recent Transactions
        // ──────────────────────────────────────────────
        const recentEntries = await prisma.journalEntry.findMany({
            where: { ...whereBranch, status: EntryStatus.POSTED },
            orderBy: [
                { date: 'desc' },
                { entryNumber: 'desc' }
            ],
            take: 5,
            include: {
                branch: { select: { name: true } },
                lines: {
                    take: 1, // We'll use the first line to determine the "primary" currency/amount
                    include: { currency: true }
                }
            }
        });

        const recentTransactions = recentEntries.map((entry: any) => {
            const primaryLine = entry.lines[0];
            return {
                ...entry,
                originalAmount: primaryLine ? (Number(primaryLine.debit) || Number(primaryLine.credit)) : Number(entry.totalAmount),
                currencyCode: primaryLine?.currency.code || baseCurrencyCode,
                currencySymbol: primaryLine?.currency.symbol || baseCurrencySymbol
            };
        });

        // ──────────────────────────────────────────────
        // 5. Expense Breakdown by Category
        // ──────────────────────────────────────────────
        const expenseRoot = await prisma.account.findFirst({ where: { code: '5' } });
        let expenseBreakdown: any[] = [];

        if (expenseRoot) {
            const categories = await prisma.account.findMany({
                where: { parentId: expenseRoot.id },
                include: { children: true }
            });

            expenseBreakdown = await Promise.all(categories.map(async (cat, index) => {
                const catLines = await prisma.journalLine.aggregate({
                    where: {
                        account: { code: { startsWith: cat.code } },
                        journalEntry: {
                            date: { gte: startOfMonth, lte: endOfMonth },
                            status: EntryStatus.POSTED,
                            ...(branchId ? { branchId } : {})
                        }
                    },
                    _sum: { baseDebit: true, baseCredit: true }
                });
                const amount = (Number(catLines._sum.baseDebit) || 0) - (Number(catLines._sum.baseCredit) || 0);
                return { name: cat.name, value: amount, color: getColorForIndex(index) };
            }));
        }

        return {
            // Base-currency totals (backward compat)
            totalLiquidity: totalAssetsBase,
            monthlyIncome,
            monthlyExpenses,
            netIncome: monthlyIncome - monthlyExpenses,

            // NEW: Multi-currency breakdowns
            assetsByCurrency,
            revenueByCurrency,
            expenseByCurrency,

            recentTransactions,
            expenseBreakdown,
            baseCurrencyCode,
            baseCurrencySymbol
        };
    }
}

function getColorForIndex(index: number) {
    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];
    return colors[index % colors.length];
}
