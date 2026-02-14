import { AccountType } from '@prisma/client';
import prisma from '../../infrastructure/database/prisma';

export class AccountService {
  async createAccount(data: { name: string, code: string, type: AccountType, currencyId: string, branchId: string, parentId?: string }) {
    return await prisma.account.create({
      data
    });
  }

  async updateAccount(id: string, data: { name?: string, code?: string, type?: AccountType, currencyId?: string, branchId?: string, parentId?: string }) {
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
        journalLines: {
          where: {
            journalEntry: {
              status: 'POSTED'
            }
          }
        }
      }
    });

    return accounts.map((acc: any) => {
      const baseDebit = acc.journalLines.reduce((sum: number, line: any) => sum + Number(line.baseDebit), 0);
      const baseCredit = acc.journalLines.reduce((sum: number, line: any) => sum + Number(line.baseCredit), 0);
      
      return {
        id: acc.id,
        code: acc.code,
        name: acc.name,
        type: acc.type,
        baseDebit,
        baseCredit,
        netBase: ['ASSET', 'EXPENSE'].includes(acc.type) ? baseDebit - baseCredit : baseCredit - baseDebit
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

    const revenues: any[] = [];
    const expenses: any[] = [];
    let totalRevenue = 0;
    let totalExpense = 0;

    const accountMap: Record<string, { name: string, amount: number, type: string }> = {};

    journalLines.forEach((line: any) => {
      const accId = line.accountId;
      if (!accountMap[accId]) {
        accountMap[accId] = { name: line.account.name, amount: 0, type: line.account.type };
      }
      
      const amount = Number(line.baseCredit) - Number(line.baseDebit);
      if (line.account.type === 'REVENUE') {
        accountMap[accId].amount += amount;
      } else {
        // Expenses: Debit - Credit
        accountMap[accId].amount += (Number(line.baseDebit) - Number(line.baseCredit));
      }
    });

    Object.values(accountMap).forEach(acc => {
      if (acc.type === 'REVENUE') {
        revenues.push(acc);
        totalRevenue += acc.amount;
      } else {
        expenses.push(acc);
        totalExpense += acc.amount;
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

    const journalLines = await prisma.journalLine.findMany({
      where: {
        accountId,
        journalEntry: {
          status: 'POSTED',
          date: {
            gte: startDate,
            lte: endDate
          }
        }
      },
      include: {
        journalEntry: true
      },
      orderBy: {
        journalEntry: {
          date: 'asc'
        }
      }
    });

    // Calculate opening balance (before startDate)
    const previousLines = await prisma.journalLine.findMany({
      where: {
        accountId,
        journalEntry: {
          status: 'POSTED',
          date: {
            lt: startDate
          }
        }
      }
    });

    const prevDebit = previousLines.reduce((sum: number, l: any) => sum + Number(l.debit), 0);
    const prevCredit = previousLines.reduce((sum: number, l: any) => sum + Number(l.credit), 0);
    
    let openingBalance = 0;
    if (['ASSET', 'EXPENSE'].includes(account.type)) {
      openingBalance = prevDebit - prevCredit;
    } else {
      openingBalance = prevCredit - prevDebit;
    }

    let runningBalance = openingBalance;
    const entries = journalLines.map((line: any) => {
      const debit = Number(line.debit);
      const credit = Number(line.credit);
      
      if (['ASSET', 'EXPENSE'].includes(account.type)) {
        runningBalance += (debit - credit);
      } else {
        runningBalance += (credit - debit);
      }

      return {
        date: line.journalEntry.date,
        entryNumber: line.journalEntry.entryNumber,
        description: line.journalEntry.description,
        debit,
        credit,
        balance: runningBalance
      };
    });

    return {
      accountName: account.name,
      accountCode: account.code,
      currency: account.currency.code,
      openingBalance,
      entries,
      closingBalance: runningBalance
    };
  }
}
