import prisma from '../../infrastructure/database/prisma';
import { JournalEntryType, EntryStatus } from '@prisma/client';

export class SubscriptionService {
    async getCollections() {
        return prisma.subscriptionCollection.findMany({
            include: {
                user: { select: { name: true } },
                items: {
                    include: {
                        member: {
                            include: {
                                entity: {
                                    include: { currency: true }
                                }
                            }
                        }
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });
    }

    async getCollection(id: string) {
        return prisma.subscriptionCollection.findUnique({
            where: { id },
            include: {
                items: {
                    include: {
                        member: {
                            include: {
                                entity: {
                                    include: { currency: true }
                                }
                            }
                        }
                    }
                },
                journalEntry: {
                    include: { lines: true }
                }
            }
        });
    }

    async deleteCollection(id: string) {
        return prisma.subscriptionCollection.delete({
            where: { id }
        });
    }

    async getMembers(entityId?: string) {
        return prisma.member.findMany({
            where: entityId ? { entityId } : {},
            include: { entity: true }
        });
    }

    async getDueMembers(entityId: string, year: number) {
        const members = await prisma.member.findMany({
            where: {
                entityId,
                affiliationYear: { lte: year },
                subscriptions: {
                    none: {
                        year: year
                    }
                }
            },
            include: {
                entity: {
                    include: {
                        currency: true
                    }
                }
            }
        });

        return members;
    }

    async collectSubscriptions(data: {
        id?: string;
        date: string;
        description: string;
        items: { memberId: string; year: number; amount: number }[];
        debitAccountId?: string;
        creditAccountId?: string;
        branchId?: string;
        status: EntryStatus;
        createdBy: string;
    }) {
        const { id, date, description, items, debitAccountId, creditAccountId, branchId, status, createdBy } = data;

        return prisma.$transaction(async (tx) => {
            // 1. Calculate total amount
            const totalAmount = items.reduce((sum, item) => sum + Number(item.amount), 0);

            // 2. Create/Update Collection
            const collection = id ? await tx.subscriptionCollection.update({
                where: { id },
                data: {
                    date: new Date(date),
                    description,
                    totalAmount,
                    status,
                    debitAccountId,
                    creditAccountId,
                    branchId,
                    items: {
                        deleteMany: {},
                        create: items.map(it => ({
                            memberId: it.memberId,
                            year: it.year,
                            amount: it.amount
                        }))
                    }
                }
            }) : await tx.subscriptionCollection.create({
                data: {
                    date: new Date(date),
                    description,
                    totalAmount,
                    status,
                    debitAccountId,
                    creditAccountId,
                    branchId,
                    createdBy,
                    items: {
                        create: items.map(it => ({
                            memberId: it.memberId,
                            year: it.year,
                            amount: it.amount
                        }))
                    }
                }
            });

            // 3. Handle Receipt Voucher if Posting
            if (status === EntryStatus.POSTED) {
                if (!debitAccountId || !creditAccountId || !branchId) {
                    throw new Error('بيانات الحسابات والفرع مطلوبة للترحيل');
                }

                // Check if already has an entry
                if (collection.journalEntryId) {
                    throw new Error('هذه المجموعة تم ترحيلها مسبقاً');
                }

                // Validate all items belong to the same branch
                const memberDetails = await tx.member.findMany({
                    where: { id: { in: items.map(it => it.memberId) } },
                    include: { entity: true }
                });

                const uniqueBranches = new Set(memberDetails.map(m => m.entity.branchId));
                if (uniqueBranches.size > 1) {
                    throw new Error('لا يمكن ترحيل سجل يحتوي على أعضاء من فروع مختلفة في سند واحد');
                }

                const branch = await tx.branch.findUnique({
                    where: { id: branchId },
                    include: { currency: true }
                });
                if (!branch) throw new Error('الفرع غير موجود');

                const currencyId = branch.currencyId;
                const exchangeRate = Number(branch.currency.exchangeRate);
                const baseAmount = totalAmount * exchangeRate;

                const lastEntry = await tx.journalEntry.findFirst({
                    where: { type: JournalEntryType.RECEIPT, branchId },
                    orderBy: { entryNumber: 'desc' },
                    select: { entryNumber: true }
                });
                const nextNumber = (lastEntry?.entryNumber || 0) + 1;

                const entry = await tx.journalEntry.create({
                    data: {
                        branchId,
                        entryNumber: nextNumber,
                        type: JournalEntryType.RECEIPT,
                        date: new Date(date),
                        description: `${description} (تحصيل اشتراكات مجمع)`,
                        totalAmount,
                        status: 'POSTED',
                        createdBy,
                        lines: {
                            create: [
                                { accountId: debitAccountId, currencyId, debit: totalAmount, credit: 0, exchangeRate, baseDebit: baseAmount, baseCredit: 0 },
                                { accountId: creditAccountId, currencyId, debit: 0, credit: totalAmount, exchangeRate, baseDebit: 0, baseCredit: baseAmount }
                            ]
                        }
                    }
                });

                // Link to collection
                await tx.subscriptionCollection.update({
                    where: { id: collection.id },
                    data: { journalEntryId: entry.id }
                });

                // Create individual subscription records
                await tx.memberSubscription.createMany({
                    data: items.map(it => ({
                        memberId: it.memberId,
                        year: it.year,
                        amount: it.amount,
                        journalEntryId: entry.id,
                        paymentDate: new Date(date)
                    }))
                });
            }

            return collection;
        });
    }

    async unpostCollection(id: string, userId: string) {
        return prisma.$transaction(async (tx) => {
            const collection = await tx.subscriptionCollection.findUnique({
                where: { id }
            });

            if (!collection) throw new Error('السجل غير موجود');
            if (collection.status !== 'POSTED') throw new Error('السجل ليس في حالة ترحيل');

            // Check if period is locked
            const period = await tx.period.findFirst({
                where: {
                    startDate: { lte: collection.date },
                    endDate: { gte: collection.date },
                    isLocked: true
                }
            });
            if (period) throw new Error(`لا يمكن إلغاء الترحيل. الفترة المحاسبية ${period.name} مغلقة.`);

            // Delete linked Journal Entry (this will cascade to MemberSubscriptions)
            if (collection.journalEntryId) {
                await tx.journalEntry.delete({
                    where: { id: collection.journalEntryId }
                });
            }

            // Reset collection
            const updated = await tx.subscriptionCollection.update({
                where: { id },
                data: {
                    status: 'DRAFT',
                    journalEntryId: null
                }
            });

            // Audit Log
            await tx.auditLog.create({
                data: {
                    userId,
                    action: 'UNPOST_COLLECTION',
                    entity: 'SubscriptionCollection',
                    entityId: id
                }
            });

            return updated;
        });
    }
}
