import { PrismaClient } from '@prisma/client';
import prisma from '../database/prisma';
import { JournalEntryDTO, AccountingValidator } from '../../domain/models/AccountingTypes';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';

const unlinkAsync = promisify(fs.unlink);

export class PrismaJournalEntryRepository {
  async create(user: { id: string, role: string }, data: JournalEntryDTO) {
    return prisma.$transaction(async (tx: any) => {
      // 0. Check branch permission for ENCARGADO
      if (user.role === 'ENCARGADO') {
        const allowedBranch = await tx.entity.findFirst({
          where: { userId: user.id, branchId: data.branchId }
        });
        if (!allowedBranch) {
          throw new Error('Forbidden: You are not authorized to create vouchers for this branch');
        }
      }

      // 0.1 Check if period is locked
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

      // 2. Validate linked accounts and securely calculate base amounts
      const accountIds = data.lines.map(l => l.accountId);
      const accounts = await tx.account.findMany({ where: { id: { in: accountIds } } });
      const accountMap = new Map<string, any>(accounts.map((a: any) => [a.id, a]));

      // 1.1 Validate cost center hierarchy for Receipts and Payments
      if (data.type === 'RECEIPT' || data.type === 'PAYMENT') {
        const allCCIds = data.lines.flatMap(l => l.costCenters?.map(cc => cc.costCenterId) || []).filter(Boolean);
        if (allCCIds.length > 0) {
          const costCenters = await tx.costCenter.findMany({
            where: { id: { in: allCCIds } },
            select: { id: true, parentId: true, name: true }
          });
          const ccMap = new Map<string, { id: string, parentId: string | null, name: string }>(
            costCenters.map((cc: any) => [cc.id, cc])
          );
          for (const line of data.lines) {
            for (const ccDist of (line.costCenters || [])) {
              const cc = ccMap.get(ccDist.costCenterId);
              if (cc && !cc.parentId) {
                throw new Error(`مركز التكلفة "${cc.name}" رئيسي. يجب اختيار مركز تكلفة فرعي لسندات القبض والصرف.`);
              }
            }
          }
        }
      }

      let totalAmount = 0;
      const validatedLines = [];

      for (const line of data.lines) {
        const account = accountMap.get(line.accountId);
        if (!account) throw new Error('Account not found');



        // Securely calculate base amounts
        const baseDebit = Number(line.debit) * Number(line.exchangeRate);
        const baseCredit = Number(line.credit) * Number(line.exchangeRate);
        totalAmount += baseDebit;

        validatedLines.push({
          accountId: line.accountId,
          currencyId: line.currencyId,
          debit: line.debit,
          credit: line.credit,
          exchangeRate: line.exchangeRate,
          baseDebit,
          baseCredit,
          costCenters: {
            create: (line.costCenters || []).map(cc => ({
              costCenterId: cc.costCenterId,
              percentage: cc.percentage
            }))
          }
        });
      }

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
            create: validatedLines
          },
          attachments: {
            create: data.attachments?.map(att => ({
              fileName: att.fileName,
              fileUrl: att.fileUrl,
              fileType: att.fileType,
              fileSize: att.fileSize
            })) || []
          }
        },
        include: {
          lines: {
            include: {
              account: true,
              currency: true,
              costCenters: { include: { costCenter: true } }
            }
          },
          attachments: true
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

  async findAll(user: { id: string, role: string }, branchId?: string, type?: string) {
    const whereAnd: any[] = [];
    if (branchId) whereAnd.push({ branchId });
    if (type) whereAnd.push({ type: type as any });

    if (user.role === 'ENCARGADO') {
      whereAnd.push({
        OR: [
          { createdBy: user.id },
          {
            memberSubscriptions: {
              some: {
                member: {
                  entity: { userId: user.id }
                }
              }
            }
          }
        ]
      });
    }

    return prisma.journalEntry.findMany({
      where: {
        AND: whereAnd
      },
      include: {
        lines: {
          include: {
            account: true,
            currency: true,
            costCenters: { include: { costCenter: true } }
          }
        },
        branch: true,
        attachments: true,
        subscriptionCollection: true
      },
      orderBy: [
        { date: 'desc' },
        { entryNumber: 'desc' }
      ]
    });
  }

  async findById(user: { id: string, role: string }, id: string) {
    const entry = await prisma.journalEntry.findUnique({
      where: { id },
      include: {
        lines: {
          include: {
            account: true,
            currency: true,
            costCenters: { include: { costCenter: true } }
          }
        },
        attachments: true,
        memberSubscriptions: {
          include: { member: { include: { entity: true } } }
        },
        subscriptionCollection: true
      }
    });

    if (!entry) return null;

    if (user.role === 'ENCARGADO') {
      const isOwner = entry.createdBy === user.id;
      const isLinkedToManagedEntity = entry.memberSubscriptions.some(
        (s: any) => s.member.entity.userId === user.id
      );
      if (!isOwner && !isLinkedToManagedEntity) {
        throw new Error('Forbidden: You do not have access to this voucher');
      }
    }

    return entry;
  }

  async update(user: { id: string, role: string }, id: string, data: JournalEntryDTO) {
    return prisma.$transaction(async (tx: any) => {
      const existing = await tx.journalEntry.findUnique({
        where: { id },
        include: { 
          memberSubscriptions: { include: { member: { include: { entity: true } } } },
          subscriptionCollection: true
        }
      });
      if (!existing) throw new Error('Entry not found');

      if (existing.subscriptionCollection) {
        throw new Error('عذراً، لا يمكن تعديل هذا السند مباشرة لأنه مرتبط بعملية تحصيل اشتراكات. يرجى تعديله من صفحة تحصيل الاشتراكات.');
      }

      if (user.role === 'ENCARGADO') {
        const isOwner = existing.createdBy === user.id;
        const isLinkedToManagedEntity = existing.memberSubscriptions.some(
          (s: any) => s.member.entity.userId === user.id
        );
        if (!isOwner && !isLinkedToManagedEntity) {
          throw new Error('Forbidden: You do not have access to this voucher');
        }
      }

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

      // Fetch old attachments to delete physical files
      const oldAttachments = await tx.attachment.findMany({ where: { journalEntryId: id } });
      for (const att of oldAttachments) {
        if (att.fileUrl) {
          const filePath = path.join(process.cwd(), att.fileUrl.startsWith('/') ? att.fileUrl.substring(1) : att.fileUrl);
          if (fs.existsSync(filePath)) {
            await unlinkAsync(filePath).catch(err => console.error(`Failed to delete file during update: ${filePath}`, err));
          }
        }
      }

      // Delete old lines and create new ones
      await tx.journalLine.deleteMany({ where: { journalEntryId: id } });
      await tx.attachment.deleteMany({ where: { journalEntryId: id } });

      // Calculate totalAmount securely and validate cost centers
      const accountIds = data.lines.map(l => l.accountId);
      const accounts = await tx.account.findMany({ where: { id: { in: accountIds } } });
      const accountMap = new Map<string, any>(accounts.map((a: any) => [a.id, a]));

      // 1.1 Validate cost center hierarchy for Receipts and Payments
      if (data.type === 'RECEIPT' || data.type === 'PAYMENT') {
        const allCCIds = data.lines.flatMap(l => l.costCenters?.map(cc => cc.costCenterId) || []).filter(Boolean);
        if (allCCIds.length > 0) {
          const costCenters = await tx.costCenter.findMany({
            where: { id: { in: allCCIds } },
            select: { id: true, parentId: true, name: true }
          });
          const ccMap = new Map<string, { id: string, parentId: string | null, name: string }>(
            costCenters.map((cc: any) => [cc.id, cc])
          );
          for (const line of data.lines) {
            for (const ccDist of (line.costCenters || [])) {
              const cc = ccMap.get(ccDist.costCenterId);
              if (cc && !cc.parentId) {
                throw new Error(`مركز التكلفة "${cc.name}" رئيسي. يجب اختيار مركز تكلفة فرعي لسندات القبض والصرف.`);
              }
            }
          }
        }
      }

      let totalAmount = 0;
      const validatedLines = [];

      for (const line of data.lines) {
        const account = accountMap.get(line.accountId);
        if (!account) throw new Error('Account not found');



        // Securely calculate base amounts
        const baseDebit = Number(line.debit) * Number(line.exchangeRate);
        const baseCredit = Number(line.credit) * Number(line.exchangeRate);
        totalAmount += baseDebit;

        validatedLines.push({
          accountId: line.accountId,
          currencyId: line.currencyId,
          debit: line.debit,
          credit: line.credit,
          exchangeRate: line.exchangeRate,
          baseDebit,
          baseCredit,
          costCenters: {
            create: (line.costCenters || []).map(cc => ({
              costCenterId: cc.costCenterId,
              percentage: cc.percentage
            }))
          }
        });
      }

      return tx.journalEntry.update({
        where: { id },
        data: {
          description: data.description,
          type: data.type,
          date: data.date,
          branchId: data.branchId,
          totalAmount,
          lines: {
            create: validatedLines
          },
          attachments: {
            create: data.attachments?.map(att => ({
              fileName: att.fileName,
              fileUrl: att.fileUrl,
              fileType: att.fileType,
              fileSize: att.fileSize
            })) || []
          }
        },
        include: {
          lines: {
            include: {
              account: true,
              currency: true,
              costCenters: { include: { costCenter: true } }
            }
          },
          attachments: true
        }
      });
    });
  }

  async delete(user: { id: string, role: string }, id: string) {
    const existing = await prisma.journalEntry.findUnique({
      where: { id },
      include: { 
        memberSubscriptions: { include: { member: { include: { entity: true } } } },
        subscriptionCollection: true
      }
    });
    if (!existing) throw new Error('Entry not found');

    if (existing.subscriptionCollection) {
      throw new Error('عذراً، لا يمكن حذف هذا السند مباشرة لأنه مرتبط بعملية تحصيل اشتراكات. يرجى حذفه من صفحة تحصيل الاشتراكات.');
    }

    if (user.role === 'ENCARGADO') {
      const isOwner = existing.createdBy === user.id;
      const isLinkedToManagedEntity = existing.memberSubscriptions.some(
        (s: any) => s.member.entity.userId === user.id
      );
      if (!isOwner && !isLinkedToManagedEntity) {
        throw new Error('Forbidden: You do not have access to this voucher');
      }
    }

    if (existing.status === 'POSTED') throw new Error('Cannot delete posted entry');

    // Fetch and delete physical files
    const attachments = await prisma.attachment.findMany({ where: { journalEntryId: id } });
    for (const att of attachments) {
      if (att.fileUrl) {
        const filePath = path.join(process.cwd(), att.fileUrl.startsWith('/') ? att.fileUrl.substring(1) : att.fileUrl);
        if (fs.existsSync(filePath)) {
          await unlinkAsync(filePath).catch(err => console.error(`Failed to delete file during deletion: ${filePath}`, err));
        }
      }
    }

    return prisma.journalEntry.delete({ where: { id } });
  }

  async postEntry(user: { id: string, role: string }, id: string) {
    return prisma.$transaction(async (tx: any) => {
      const entry = await tx.journalEntry.findUnique({
        where: { id },
        include: {
          lines: { include: { account: true } },
          memberSubscriptions: { include: { member: { include: { entity: true } } } }
        }
      });

      if (!entry) throw new Error('Entry not found');

      if (user.role === 'ENCARGADO') {
        const isOwner = entry.createdBy === user.id;
        const isLinkedToManagedEntity = entry.memberSubscriptions.some(
          (s: any) => s.member.entity.userId === user.id
        );
        if (!isOwner && !isLinkedToManagedEntity) {
          throw new Error('Forbidden: You do not have access to this voucher');
        }
      }
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
          userId: user.id,
          action: 'POST',
          entity: 'JournalEntry',
          entityId: updated.id,
        }
      });

      return updated;
    });
  }

  async unpostEntry(user: { id: string, role: string }, id: string) {
    return prisma.$transaction(async (tx: any) => {
      const entry = await tx.journalEntry.findUnique({
        where: { id },
        include: {
          lines: true,
          memberSubscriptions: { include: { member: { include: { entity: true } } } }
        }
      });

      if (!entry) throw new Error('Entry not found');

      if (user.role === 'ENCARGADO') {
        const isOwner = entry.createdBy === user.id;
        const isLinkedToManagedEntity = entry.memberSubscriptions.some(
          (s: any) => s.member.entity.userId === user.id
        );
        if (!isOwner && !isLinkedToManagedEntity) {
          throw new Error('Forbidden: You do not have access to this voucher');
        }
      }
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
          userId: user.id,
          action: 'UNPOST',
          entity: 'JournalEntry',
          entityId: updated.id,
        }
      });

      return updated;
    });
  }
}
