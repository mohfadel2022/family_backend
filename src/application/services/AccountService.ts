import { AccountType } from '@prisma/client';
import prisma from '../../infrastructure/database/prisma';

export class AccountService {
  private async getDescendantIds(parentId: string): Promise<string[]> {
    const children = await prisma.account.findMany({ where: { parentId } });
    let ids = children.map(c => c.id);
    for (const child of children) {
      ids = ids.concat(await this.getDescendantIds(child.id));
    }
    return ids;
  }
  async createAccount(data: { name: string, code: string, type: AccountType, currencyId: string, branchId: string, parentId?: string }) {
    const existing = await prisma.account.findUnique({ where: { code: data.code } });
    if (existing) {
      throw new Error('كود الحساب موجود مسبقاً، يرجى اختيار كود آخر');
    }
    return await prisma.account.create({
      data
    });
  }

  async updateAccount(id: string, data: { name?: string, code?: string, type?: AccountType, currencyId?: string, branchId?: string, parentId?: string }) {
    if (data.code) {
      const existing = await prisma.account.findFirst({
        where: {
          code: data.code,
          NOT: { id }
        }
      });
      if (existing) {
        throw new Error('كود الحساب موجود مسبقاً، يرجى اختيار كود آخر');
      }
    }
    return await prisma.account.update({
      where: { id },
      data
    });
  }

  async deleteAccount(id: string) {
    // Check if account has journal lines
    const linesCount = await prisma.journalLine.count({
      where: { accountId: id }
    });

    if (linesCount > 0) {
      throw new Error('لا يمكن حذف الحساب نظراً لوجود قيود محاسبية مرتبطة به');
    }

    // Check if account has children
    const childrenCount = await prisma.account.count({
      where: { parentId: id }
    });

    if (childrenCount > 0) {
      throw new Error('لا يمكن حذف الحساب لأنه يحتوي على حسابات فرعية (Children)');
    }

    return await prisma.account.delete({
      where: { id }
    });
  }

  async getAccountBalance(accountId: string) {
    const account = await prisma.account.findUnique({
      where: { id: accountId },
      include: {
        journalLines: {
          where: {
            journalEntry: {
              status: 'POSTED'
            }
          }
        }
      }
    });

    if (!account) throw new Error('Account not found');

    const totalDebit = account.journalLines.reduce((sum: number, line: any) => sum + Number(line.debit), 0);
    const totalCredit = account.journalLines.reduce((sum: number, line: any) => sum + Number(line.credit), 0);

    let balance = 0;
    if (['ASSET', 'EXPENSE'].includes(account.type)) {
      balance = totalDebit - totalCredit;
    } else {
      balance = totalCredit - totalDebit;
    }

    return {
      accountId,
      accountName: account.name,
      currencyId: account.currencyId,
      totalDebit,
      totalCredit,
      balance
    };
  }

  async getTrialBalance(branchId?: string) {
    // Consolidated or per branch using Base Currency
    const accounts = await prisma.account.findMany({
      where: branchId ? { branchId } : undefined,
      include: {
        currency: true,
        journalLines: {
          where: {
            journalEntry: {
              status: 'POSTED'
            }
          }
        }
      }
    });

    const accountNodes: Record<string, any> = {};
    accounts.forEach(acc => {
      const ownBaseDebit = acc.journalLines.reduce((sum: number, line: any) => sum + Number(line.baseDebit), 0);
      const ownBaseCredit = acc.journalLines.reduce((sum: number, line: any) => sum + Number(line.baseCredit), 0);
      const ownDebit = acc.journalLines.reduce((sum: number, line: any) => sum + Number(line.debit), 0);
      const ownCredit = acc.journalLines.reduce((sum: number, line: any) => sum + Number(line.credit), 0);

      accountNodes[acc.id] = {
        id: acc.id,
        code: acc.code,
        name: acc.name,
        type: acc.type,
        currencyCode: acc.currency?.code,
        isBase: acc.currency?.isBase,
        currentRate: Number(acc.currency?.exchangeRate) || 1,
        parentId: acc.parentId,
        ownBaseDebit,
        ownBaseCredit,
        ownDebit,
        ownCredit,
        totalBaseDebit: 0,
        totalBaseCredit: 0,
        totalDebit: 0,
        totalCredit: 0,
        calculated: false
      };
    });

    const calculateTotals = (accId: string): { bd: number, bc: number, d: number, c: number } => {
      const node = accountNodes[accId];
      if (!node) return { bd: 0, bc: 0, d: 0, c: 0 };
      if (node.calculated) return {
        bd: node.totalBaseDebit,
        bc: node.totalBaseCredit,
        d: node.totalDebit,
        c: node.totalCredit
      };

      let bd = node.ownBaseDebit;
      let bc = node.ownBaseCredit;
      let d = node.ownDebit;
      let c = node.ownCredit;

      const children = Object.values(accountNodes).filter((n: any) => n.parentId === accId);
      for (const child of children) {
        const childTotals = calculateTotals(child.id);
        bd += childTotals.bd;
        bc += childTotals.bc;
        // Only sum foreign currency if they match (simplified assumption for trial balance view)
        // Usually, parent foreign currency total is only valid if all children have same currency.
        // We'll sum it anyway but show currency code as MIXED if different (though UI might just show code).
        d += childTotals.d;
        c += childTotals.c;
      }

      node.totalBaseDebit = bd;
      node.totalBaseCredit = bc;
      node.totalDebit = d;
      node.totalCredit = c;
      node.calculated = true;
      return { bd, bc, d, c };
    };

    Object.keys(accountNodes).forEach(id => calculateTotals(id));

    return Object.values(accountNodes).map((node: any) => {
      const netBase = ['ASSET', 'EXPENSE'].includes(node.type)
        ? node.totalBaseDebit - node.totalBaseCredit
        : node.totalBaseCredit - node.totalBaseDebit;

      const netForeign = ['ASSET', 'EXPENSE'].includes(node.type)
        ? node.totalDebit - node.totalCredit
        : node.totalCredit - node.totalDebit;

      return {
        id: node.id,
        code: node.code,
        name: node.name,
        type: node.type,
        currency: node.currencyCode || '---',
        isBase: node.isBase,
        baseDebit: node.totalBaseDebit,
        baseCredit: node.totalBaseCredit,
        netBase: netBase,
        foreignBalance: netForeign,
        currentRate: node.currentRate,
        avgRate: netForeign !== 0 ? Math.abs(netBase / netForeign) : node.currentRate,
        parentId: node.parentId
      };
    });
  }

  async getIncomeStatement(branchId?: string, startDate?: Date, endDate?: Date) {
    const journalLines = await prisma.journalLine.findMany({
      where: {
        journalEntry: {
          status: 'POSTED',
          branchId: branchId ? branchId : undefined,
          date: {
            gte: startDate,
            lte: endDate
          }
        },
        account: {
          type: {
            in: ['REVENUE', 'EXPENSE']
          }
        }
      },
      include: {
        account: true
      }
    });

    const accounts = await prisma.account.findMany({
      where: { type: { in: ['REVENUE', 'EXPENSE'] } },
      include: { currency: true }
    });

    const accountMap: Record<string, any> = {};
    accounts.forEach(acc => {
      accountMap[acc.id] = {
        id: acc.id,
        code: acc.code, // Added code
        name: acc.name,
        type: acc.type,
        currency: acc.currency?.code || '---',
        isBase: acc.currency?.isBase, // track if it's base
        parentId: acc.parentId,
        ownAmount: 0,
        ownForeignAmount: 0, // track foreign
        totalAmount: 0,
        totalForeignAmount: 0,
        calculated: false
      };
    });

    journalLines.forEach((line: any) => {
      const accId = line.accountId;
      if (accountMap[accId]) {
        let amount = 0;
        let foreignAmount = 0;
        if (line.account.type === 'REVENUE') {
          amount = Number(line.baseCredit) - Number(line.baseDebit);
          foreignAmount = Number(line.credit) - Number(line.debit);
        } else {
          amount = Number(line.baseDebit) - Number(line.baseCredit);
          foreignAmount = Number(line.debit) - Number(line.credit);
        }
        accountMap[accId].ownAmount += amount;
        accountMap[accId].ownForeignAmount += foreignAmount;
      }
    });

    const calculateTotals = (accId: string): { base: number, foreign: number } => {
      const node = accountMap[accId];
      if (!node) return { base: 0, foreign: 0 };
      if (node.calculated) return { base: node.totalAmount, foreign: node.totalForeignAmount };

      let baseAmt = node.ownAmount;
      let foreignAmt = node.ownForeignAmount;

      const children = Object.values(accountMap).filter((n: any) => n.parentId === accId);
      for (const child of children) {
        const childTotals = calculateTotals(child.id);
        baseAmt += childTotals.base;
        // Logic: foreignAmt only sums if currencies match exactly or if parent/child are both non-base
        foreignAmt += childTotals.foreign;
      }

      node.totalAmount = baseAmt;
      node.totalForeignAmount = foreignAmt;
      node.calculated = true;
      return { base: baseAmt, foreign: foreignAmt };
    };

    Object.keys(accountMap).forEach(id => calculateTotals(id));

    const revenues: any[] = [];
    const expenses: any[] = [];
    let totalRevenue = 0;
    let totalExpense = 0;

    Object.values(accountMap).forEach((acc: any) => {
      // For total revenue/expense, sum only top-level items to avoid double counting
      if (!acc.parentId) {
        if (acc.type === 'REVENUE') totalRevenue += acc.totalAmount;
        else if (acc.type === 'EXPENSE') totalExpense += acc.totalAmount;
      }

      // Only include accounts that have a non-zero representation
      if (acc.totalAmount !== 0 || acc.totalForeignAmount !== 0) {
        const item = {
          id: acc.id,
          code: acc.code,
          name: acc.name,
          amount: acc.totalAmount, // This is DZD total
          foreignAmount: acc.totalForeignAmount, // This is EUR/Original total
          isBase: acc.isBase,
          type: acc.type,
          currency: acc.currency,
          parentId: acc.parentId
        };
        if (acc.type === 'REVENUE') revenues.push(item);
        else expenses.push(item);
      }
    });

    return {
      revenues,
      expenses,
      totalRevenue,
      totalExpense,
      netIncome: totalRevenue - totalExpense
    };
  }

  async getAccountStatement(accountId: string, startDate?: Date, endDate?: Date) {
    const account = await prisma.account.findUnique({
      where: { id: accountId },
      include: { currency: true }
    });

    if (!account) throw new Error('Account not found');

    const descendantIds = await this.getDescendantIds(accountId);
    const accountIds = [accountId, ...descendantIds];
    const isNormalDebit = ['ASSET', 'EXPENSE'].includes(account.type);
    const accountCurrencyId = account.currencyId;
    const accountCurrencyRate = Number(account.currency.exchangeRate) || 1;

    const journalLines = await prisma.journalLine.findMany({
      where: {
        accountId: { in: accountIds },
        journalEntry: {
          status: 'POSTED',
          date: {
            gte: startDate,
            lte: endDate
          }
        }
      },
      include: {
        journalEntry: true,
        account: { include: { currency: true } },
        currency: true
      },
      orderBy: {
        journalEntry: {
          date: 'asc'
        }
      }
    });

    // Calculate opening balance (before startDate)
    const previousLines = startDate ? await prisma.journalLine.findMany({
      where: {
        accountId: { in: accountIds },
        journalEntry: {
          status: 'POSTED',
          date: {
            lt: startDate
          }
        }
      }
    }) : [];

    const prevBaseDebit = previousLines.reduce((sum: number, l: any) => sum + Number(l.baseDebit), 0);
    const prevBaseCredit = previousLines.reduce((sum: number, l: any) => sum + Number(l.baseCredit), 0);
    const openingBaseBalance = isNormalDebit ? prevBaseDebit - prevBaseCredit : prevBaseCredit - prevBaseDebit;

    // For account-currency opening balance: 
    // If leaf/homogeneous currency -> sum original debit/credit.
    // Otherwise -> convert from consolidated base balance.
    const hasMixedInOpening = previousLines.some(l => l.currencyId !== accountCurrencyId);
    let openingBalance: number;
    if (hasMixedInOpening) {
        openingBalance = accountCurrencyRate !== 0 ? openingBaseBalance / accountCurrencyRate : 0;
    } else {
        const prevDebit = previousLines.reduce((sum: number, l: any) => sum + Number(l.debit), 0);
        const prevCredit = previousLines.reduce((sum: number, l: any) => sum + Number(l.credit), 0);
        openingBalance = isNormalDebit ? prevDebit - prevCredit : prevCredit - prevDebit;
    }

    let runningBalance = openingBalance;
    let runningBaseBalance = openingBaseBalance;

    const entries = journalLines.map((line: any) => {
      const baseDebit = Number(line.baseDebit);
      const baseCredit = Number(line.baseCredit);
      
      let debit: number;
      let credit: number;

      // Use original amount if same currency to avoid rounding issues, otherwise convert from base
      if (line.accountId === accountId || line.currencyId === accountCurrencyId) {
          debit = Number(line.debit);
          credit = Number(line.credit);
      } else {
          debit = accountCurrencyRate !== 0 ? baseDebit / accountCurrencyRate : 0;
          credit = accountCurrencyRate !== 0 ? baseCredit / accountCurrencyRate : 0;
      }

      if (isNormalDebit) {
        runningBalance += (debit - credit);
        runningBaseBalance += (baseDebit - baseCredit);
      } else {
        runningBalance += (credit - debit);
        runningBaseBalance += (baseCredit - baseDebit);
      }

      return {
        date: line.journalEntry.date,
        entryNumber: line.journalEntry.entryNumber,
        description: line.journalEntry.description,
        debit,
        credit,
        baseDebit,
        baseCredit,
        balance: runningBalance,
        baseBalance: runningBaseBalance,
        originalCurrency: line.currency.code,
        originalCurrencyName: line.currency.name,
        originalCurrencySymbol: line.currency.symbol,
        originalDebit: line.debit,
        originalCredit: line.credit
      };
    });

    return {
      accountName: account.name,
      accountCode: account.code,
      currency: account.currency?.code || '---',
      currencyName: account.currency?.name || '',
      currencySymbol: account.currency?.symbol || '',
      isBase: account.currency?.isBase || false,
      openingBalance,
      openingBaseBalance,
      entries,
      closingBalance: runningBalance,
      closingBaseBalance: runningBaseBalance
    };
  }

  async getAccountsWithBalances(branchId?: string) {
    const accounts = await prisma.account.findMany({
      where: branchId ? { branchId } : undefined,
      include: {
        currency: true,
        journalLines: {
          where: {
            journalEntry: {
              status: 'POSTED'
            }
          }
        }
      }
    });

    const accountMap: Record<string, any> = {};
    accounts.forEach(acc => {
      // Base currency totals (converted)
      const ownBaseDebit = acc.journalLines.reduce((s: number, l: any) => s + Number(l.baseDebit), 0);
      const ownBaseCredit = acc.journalLines.reduce((s: number, l: any) => s + Number(l.baseCredit), 0);
      // Direct foreign-currency totals (no conversion)
      const ownDebit = acc.journalLines.reduce((s: number, l: any) => s + Number(l.debit), 0);
      const ownCredit = acc.journalLines.reduce((s: number, l: any) => s + Number(l.credit), 0);

      const { journalLines, ...accountData } = acc;
      accountMap[acc.id] = {
        ...accountData,
        ownBaseDebit,
        ownBaseCredit,
        ownDebit,
        ownCredit,
        // Totals filled by calculateTotals()
        totalBaseDebit: 0,
        totalBaseCredit: 0,
        totalOwnDebit: 0,
        totalOwnCredit: 0,
        allSameCurrency: true, // becomes false when a child has a different currency
        calculated: false
      };
    });

    // ── Recursive aggregation ──────────────────────────────────────────────────
    // Returns accumulated base and own-currency totals.
    // allSameCurrency = all descendants share the same currency as this node.
    const calculateTotals = (
      accId: string
    ): { bd: number; bc: number; od: number; oc: number; sameCurrency: boolean } => {
      const node = accountMap[accId];
      if (!node) return { bd: 0, bc: 0, od: 0, oc: 0, sameCurrency: true };
      if (node.calculated) return {
        bd: node.totalBaseDebit,
        bc: node.totalBaseCredit,
        od: node.totalOwnDebit,
        oc: node.totalOwnCredit,
        sameCurrency: node.allSameCurrency
      };

      let bd = node.ownBaseDebit;
      let bc = node.ownBaseCredit;
      let od = node.ownDebit;
      let oc = node.ownCredit;
      let allSame = true;

      const children = Object.values(accountMap).filter((n: any) => n.parentId === accId);
      for (const child of children) {
        const ct = calculateTotals(child.id);
        bd += ct.bd;
        bc += ct.bc;
        // Sum own-currency amounts only when the child shares the same currency
        // AND the child's own subtree is uniform in that currency.
        if (child.currency?.code === node.currency?.code && ct.sameCurrency) {
          od += ct.od;
          oc += ct.oc;
        } else {
          allSame = false;
          // od/oc become unreliable for this node — keep them for informational purposes only
          od += ct.od;
          oc += ct.oc;
        }
      }

      node.totalBaseDebit = bd;
      node.totalBaseCredit = bc;
      node.totalOwnDebit = od;
      node.totalOwnCredit = oc;
      node.allSameCurrency = allSame;
      node.calculated = true;
      return { bd, bc, od, oc, sameCurrency: allSame };
    };

    Object.keys(accountMap).forEach(id => calculateTotals(id));

    // ── Build per-currency breakdown for mixed parents ─────────────────────────
    // For a mixed-currency parent we show how much each direct child group contributes
    // in its own currency.
    const buildChildCurrencies = (nodeId: string): Record<string, number> => {
      const result: Record<string, number> = {};
      const directChildren = Object.values(accountMap).filter((n: any) => n.parentId === nodeId);
      // Group direct children by currency
      const byCurrency: Record<string, any[]> = {};
      directChildren.forEach((child: any) => {
        const code = child.currency?.code || '?';
        if (!byCurrency[code]) byCurrency[code] = [];
        byCurrency[code].push(child);
      });

      for (const [code, children] of Object.entries(byCurrency)) {
        let total = 0;
        for (const child of children) {
          // Use own-currency balance if all same, otherwise convert from base
          if (child.allSameCurrency) {
            const net = ['ASSET', 'EXPENSE'].includes(child.type)
              ? child.totalOwnDebit - child.totalOwnCredit
              : child.totalOwnCredit - child.totalOwnDebit;
            total += net;
          } else {
            const netBase = ['ASSET', 'EXPENSE'].includes(child.type)
              ? child.totalBaseDebit - child.totalBaseCredit
              : child.totalBaseCredit - child.totalBaseDebit;
            const cRate = Number(child.currency?.exchangeRate) || 1;
            total += cRate !== 0 ? netBase / cRate : 0;
          }
        }
        if (total !== 0) result[code] = total;
      }
      return result;
    };

    // ── Final mapping ──────────────────────────────────────────────────────────
    return Object.values(accountMap).map((node: any) => {
      const isNormalDebitAccount = ['ASSET', 'EXPENSE'].includes(node.type);

      const netBaseBalance = isNormalDebitAccount
        ? node.totalBaseDebit - node.totalBaseCredit
        : node.totalBaseCredit - node.totalBaseDebit;

      // ✅ KEY FIX:
      // - If all descendants share the same currency → use direct own-currency sum (exact, no rounding)
      // - If currencies are mixed → convert base total back to account's currency (approximate)
      let balance: number;
      if (node.allSameCurrency) {
        balance = isNormalDebitAccount
          ? node.totalOwnDebit - node.totalOwnCredit
          : node.totalOwnCredit - node.totalOwnDebit;
      } else {
        const rate = Number(node.currency?.exchangeRate) || 1;
        balance = rate !== 0 ? netBaseBalance / rate : 0;
      }

      const hasMixedCurrencies = !node.allSameCurrency;
      const childCurrencies = hasMixedCurrencies ? buildChildCurrencies(node.id) : undefined;

      return {
        ...node,
        balance,
        baseBalance: netBaseBalance,
        hasMixedCurrencies,
        childCurrencies,
        // Strip internal computation fields
        calculated: undefined,
        ownBaseDebit: undefined,
        ownBaseCredit: undefined,
        ownDebit: undefined,
        ownCredit: undefined,
        totalBaseDebit: undefined,
        totalBaseCredit: undefined,
        totalOwnDebit: undefined,
        totalOwnCredit: undefined,
        allSameCurrency: undefined
      };
    });
  }

}
