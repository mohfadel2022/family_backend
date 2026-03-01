import { PrismaClient } from '@prisma/client';
import prisma from '../database/prisma';
import { JournalEntryDTO, AccountingValidator } from '../../domain/models/AccountingTypes';

export class PrismaJournalEntryRepository {
  async create(data: JournalEntryDTO) {
    return prisma.$transaction(async (tx: any) => {
      // 0. Check if period is locked
      const period = await tx.period.findFirst({
        where: {
          startDate: { lte: data.date },
          endDate: { gte: data.date },
          isLocked: true
        }
      });
      if (period) throw new Error(`The date ${data.date.toISOString().split('T')[0]} is within a locked period: ${period.name}`);

      // 1. Calculate next entry number per type
      const lastEntry = await tx.journalEntry.findFirst({
        where: { type: data.type },
        orderBy: { entryNumber: 'desc' },
        select: { entryNumber: true }
      });
      const nextNumber = (lastEntry?.entryNumber || 0) + 1;

      // 2. Calculate totalAmount (sum of baseDebit)
      const totalAmount = data.lines.reduce((sum, line) => sum + Number(line.baseDebit), 0);

      // 3. Create Journal Entry
      const entry = await tx.journalEntry.create({
        data: {
          entryNumber: nextNumber,
          type: data.type,
          branchId: data.branchId,
          description: data.description,
          date: data.date,
          createdBy: data.createdBy,
          status: 'DRAFT',
          totalAmount,
          lines: {
            create: data.lines.map(line => ({
              accountId: line.accountId,
              currencyId: line.currencyId,
              debit: line.debit,
              credit: line.credit,
              exchangeRate: line.exchangeRate,
              baseDebit: line.baseDebit,
              baseCredit: line.baseCredit,
            }))
          }
        },
        include: {
          lines: true
        }
      });

      // Simple audit log
      await tx.auditLog.create({
        data: {
          userId: data.createdBy,
          action: 'CREATE',
          entity: 'JournalEntry',
          entityId: entry.id,
          details: { entryNumber: entry.entryNumber }
        }
      });

      return entry;
    });
  }

  async findAll(branchId?: string, type?: string) {
    return prisma.journalEntry.findMany({
      where: {
        AND: [
          branchId ? { branchId } : {},
          type ? { type: type as any } : {}
        ]
      },
      include: {
        lines: {
          include: {
            account: true,
            currency: true
          }
        },
        branch: true
      },
      orderBy: [
        { date: 'desc' },
        { entryNumber: 'desc' }
      ]
    });
  }

  async findById(id: string) {
    return prisma.journalEntry.findUnique({
      where: { id },
      include: {
        lines: {
          include: {
            account: true,
            currency: true
          }
        }
      }
    });
  }

  async update(id: string, data: JournalEntryDTO) {
    return prisma.$transaction(async (tx: any) => {
      const existing = await tx.journalEntry.findUnique({ where: { id } });
      if (!existing) throw new Error('Entry not found');
      if (existing.status === 'POSTED') throw new Error('Cannot update posted entry');

      // Check if new date is in locked period
      const period = await tx.period.findFirst({
        where: {
          startDate: { lte: data.date },
          endDate: { gte: data.date },
          isLocked: true
        }
      });
      if (period) throw new Error(`The date ${data.date.toISOString().split('T')[0]} is within a locked period: ${period.name}`);

      // Delete old lines and create new ones
      await tx.journalLine.deleteMany({ where: { journalEntryId: id } });

      // Calculate totalAmount
      const totalAmount = data.lines.reduce((sum, line) => sum + Number(line.baseDebit), 0);

      return tx.journalEntry.update({
        where: { id },
        data: {
          description: data.description,
          type: data.type,
          date: data.date,
          branchId: data.branchId,
          totalAmount,
          lines: {
            create: data.lines.map(line => ({
              accountId: line.accountId,
              currencyId: line.currencyId,
              debit: line.debit,
              credit: line.credit,
              exchangeRate: line.exchangeRate,
              baseDebit: line.baseDebit,
              baseCredit: line.baseCredit,
            }))
          }
        },
        include: { lines: true }
      });
    });
  }

  async delete(id: string) {
    const existing = await prisma.journalEntry.findUnique({ where: { id } });
    if (!existing) throw new Error('Entry not found');
    if (existing.status === 'POSTED') throw new Error('Cannot delete posted entry');

    return prisma.journalEntry.delete({ where: { id } });
  }

  async postEntry(id: string, userId: string) {
    return prisma.$transaction(async (tx: any) => {
      const entry = await tx.journalEntry.findUnique({
        where: { id },
        include: { lines: { include: { account: true } } }
      });

      if (!entry) throw new Error('Entry not found');
      if (entry.status === 'POSTED') throw new Error('Entry already posted');

      // Check if period is locked
      const period = await tx.period.findFirst({
        where: {
          startDate: { lte: entry.date },
          endDate: { gte: entry.date },
          isLocked: true
        }
      });
      if (period) throw new Error(`Cannot post entry. Period ${period.name} is locked.`);

      // Validate balance
      const totalBaseDebit = entry.lines.reduce((sum: number, line: any) => sum + Number(line.baseDebit), 0);
      const totalBaseCredit = entry.lines.reduce((sum: number, line: any) => sum + Number(line.baseCredit), 0);

      if (Math.abs(totalBaseDebit - totalBaseCredit) > 0.0001) {
        throw new Error('Journal entry is not balanced in base currency');
      }

      // Validate account currency
      for (const line of entry.lines) {
        if (line.currencyId !== line.account.currencyId) {
          throw new Error(`Currency mismatch for account ${line.account.name}`);
        }
      }

      const updated = await tx.journalEntry.update({
        where: { id },
        data: { status: 'POSTED' }
      });

      await tx.auditLog.create({
        data: {
          userId,
          action: 'POST',
          entity: 'JournalEntry',
          entityId: updated.id,
        }
      });

      return updated;
    });
  }

  async unpostEntry(id: string, userId: string) {
    return prisma.$transaction(async (tx: any) => {
      const entry = await tx.journalEntry.findUnique({
        where: { id },
        include: { lines: true }
      });

      if (!entry) throw new Error('Entry not found');
      if (entry.status === 'DRAFT') throw new Error('Entry is already in draft status');

      // Check if period is locked
      const period = await tx.period.findFirst({
        where: {
          startDate: { lte: entry.date },
          endDate: { gte: entry.date },
          isLocked: true
        }
      });
      if (period) throw new Error(`Cannot unpost entry. Period ${period.name} is locked.`);

      const updated = await tx.journalEntry.update({
        where: { id },
        data: { status: 'DRAFT' }
      });

      await tx.auditLog.create({
        data: {
          userId,
          action: 'UNPOST',
          entity: 'JournalEntry',
          entityId: updated.id,
        }
      });

      return updated;
    });
  }
}
