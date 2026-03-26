import prisma from '../../infrastructure/database/prisma';
import { JournalEntryType, EntryStatus } from '@prisma/client';

export class SubscriptionService {
    async getCollections(user: { id: string, role: string }) {
        const where: any = {};
        if (user.role === 'ENCARGADO') {
            where.items = {
                some: {
                    member: {
                        entity: {
                            userId: user.id
                        }
                    }
                }
            };
        }

        const collections = await prisma.subscriptionCollection.findMany({
            where,
            include: {
                user: { select: { name: true } },
                debitAccount: {
                    include: {
                        currency: { select: { symbol: true, name: true, code: true } }
                    }
                },
                creditAccount: { select: { name: true, code: true } },
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

        // Flatten currency for frontend convenience
        return collections.map(c => ({
            ...c,
            currency: c.debitAccount?.currency?.name || '---'
        }));
    }

    async getCollection(user: { id: string, role: string }, id: string) {
        const collection = await prisma.subscriptionCollection.findUnique({
            where: { id },
            include: {
                debitAccount: { select: { name: true, code: true } },
                creditAccount: { select: { name: true, code: true } },
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
                    include: {
                        lines: {
                            include: { account: true, currency: true }
                        }
                    }
                }
            }
        });

        if (!collection) return null;

        if (user.role === 'ENCARGADO') {
            // Check if any member in the collection belongs to an entity managed by the user
            const member = collection.items[0]?.member;
            if (member) {
                const ownEntity = await prisma.entity.findFirst({
                    where: { id: member.entityId, userId: user.id }
                });
                if (!ownEntity) throw new Error('لا تملك صلاحية الوصول لهذا السجل');
            }
        }

        return collection;
    }

    async deleteCollection(user: { id: string, role: string }, id: string) {
        const existing = await prisma.subscriptionCollection.findUnique({
            where: { id },
            include: { items: { include: { member: true } } }
        });

        if (!existing) throw new Error('السجل غير موجود');

        if (user.role === 'ENCARGADO') {
            const member = existing.items[0]?.member;
            if (member) {
                const ownEntity = await prisma.entity.findFirst({
                    where: { id: member.entityId, userId: user.id }
                });
                if (!ownEntity) throw new Error('لا تملك صلاحية حذف هذا السجل');
            }
        }

        return prisma.$transaction(async (tx) => {
            // Delete linked receipt if it exists
            if (existing.journalEntryId) {
                await tx.journalEntry.delete({
                    where: { id: existing.journalEntryId }
                });
            }

            return tx.subscriptionCollection.delete({
                where: { id }
            });
        });
    }

    async getMembers(user: { id: string, role: string }, entityId?: string) {
        let where: any = entityId ? { entityId } : {};

        if (user.role === 'ENCARGADO') {
            if (entityId) {
                // Verify they own this entity
                const ownEntity = await prisma.entity.findFirst({
                    where: { id: entityId, userId: user.id }
                });
                if (!ownEntity) {
                    // Force an empty allow if they don't own it
                    return [];
                }
            } else {
                // No specific entity requested, only show their own entities
                where = { entity: { userId: user.id } };
            }
        }

        return prisma.member.findMany({
            where,
            include: {
                entity: true,
                manager: { select: { id: true, name: true, phone: true } },
                subscriptions: true,
                exemptions: true
            }
        });
    }

    async getDueMembers(user: { id: string, role: string }, entityId: string, year: number) {
        // Enforce ownership if Encargado
        if (user.role === 'ENCARGADO') {
            const ownEntity = await prisma.entity.findFirst({
                where: { id: entityId, userId: user.id }
            });
            if (!ownEntity) throw new Error('لا تملك صلاحية الوصول لهذه الجهة');
        }

        const members = await prisma.member.findMany({
            where: {
                entityId,
                affiliationYear: { lte: year },
                subscriptions: {
                    none: {
                        year: year
                    }
                },
                exemptions: {
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
                },
                manager: {
                    select: { id: true, name: true, phone: true }
                }
            }
        });

        return members;
    }

    async collectSubscriptions(user: { id: string, role: string }, data: {
        id?: string;
        date: string;
        description: string;
        items: { memberId: string; year: number; amount: number }[];
        debitAccountId?: string;
        creditAccountId?: string;
        branchId?: string;
        status: EntryStatus;
    }) {
        const { id, date, description, items, debitAccountId, creditAccountId, branchId, status } = data;
        const createdBy = user.id;

        console.log('--- Collection Process Start ---', { status, id, itemsCount: items.length });

        return prisma.$transaction(async (tx) => {
            // 0. Validate same entity for all members
            const members = await tx.member.findMany({
                where: { id: { in: items.map(it => it.memberId) } },
                select: { entityId: true }
            });
            const entityIds = new Set(members.map(m => m.entityId));
            if (entityIds.size > 1) {
                throw new Error('لا يمكن تحصيل اشتراكات لأكثر من جهة في سجل واحد');
            }

            const targetEntityId = Array.from(entityIds)[0];
            if (user.role === 'ENCARGADO') {
                const ownEntity = await tx.entity.findFirst({
                    where: { id: targetEntityId, userId: user.id }
                });
                if (!ownEntity) throw new Error('لا تملك صلاحية تحصيل اشتراكات لهذه الجهة');
            }

            // 1. Calculate total amount defensively from possible Decimal objects
            const totalAmount = items.reduce((sum, item) => {
                const val = item.amount as any;
                const amt = (typeof val === 'object' && val !== null) ? Number(val.toString()) : Number(val);
                return sum + (isNaN(amt) ? 0 : amt);
            }, 0);

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
                        create: items.map(it => {
                            const val = it.amount as any;
                            return {
                                memberId: it.memberId,
                                year: it.year,
                                amount: (typeof val === 'object' && val !== null) ? Number(val.toString()) : Number(val)
                            };
                        })
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
                        create: items.map(it => {
                            const val = it.amount as any;
                            return {
                                memberId: it.memberId,
                                year: it.year,
                                amount: (typeof val === 'object' && val !== null) ? Number(val.toString()) : Number(val)
                            };
                        })
                    }
                }
            });

            console.log('Collection Record Handled:', collection.id);

            let journalEntryId = collection.journalEntryId;

            // 3. Handle Receipt Voucher if Posting
            if (status === EntryStatus.POSTED) {
                // ... validation ...
                if (!debitAccountId || !creditAccountId || !branchId) {
                    throw new Error('بيانات الحسابات والفرع مطلوبة للترحيل');
                }

                if (collection.journalEntryId) {
                    throw new Error('هذه المجموعة تم ترحيلها مسبقاً');
                }

                // ... fetch branch ...
                const memberDetails = await tx.member.findMany({
                    where: { id: { in: items.map(it => it.memberId) } },
                    include: { entity: true }
                });

                const uniqueBranches = new Set(memberDetails.map(m => m.entity.branchId));
                if (uniqueBranches.size > 1) {
                    throw new Error('لا يمكن ترحيل سجل يحتوي على أعضاء من فروع مختلفة في سند واحد');
                }

                const targetEntity = await tx.entity.findUnique({
                    where: { id: targetEntityId },
                    include: { currency: true }
                });
                if (!targetEntity) throw new Error('الجهة غير موجودة');

                const entityExchangeRate = Number(targetEntity.currency.exchangeRate || 1);
                const baseAmount = totalAmount * entityExchangeRate;

                const debitAccount = await tx.account.findUnique({
                    where: { id: debitAccountId },
                    include: { currency: true }
                });
                const creditAccount = await tx.account.findUnique({
                    where: { id: creditAccountId },
                    include: { currency: true }
                });

                if (!debitAccount || !creditAccount) throw new Error('الحسابات المحددة غير موجودة');

                const debitRate = Number(debitAccount.currency.exchangeRate || 1);
                const creditRate = Number(creditAccount.currency.exchangeRate || 1);

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
                                {
                                    accountId: debitAccountId,
                                    currencyId: debitAccount.currencyId,
                                    debit: baseAmount / debitRate,
                                    credit: 0,
                                    exchangeRate: debitRate,
                                    baseDebit: baseAmount,
                                    baseCredit: 0
                                },
                                {
                                    accountId: creditAccountId,
                                    currencyId: creditAccount.currencyId,
                                    debit: 0,
                                    credit: baseAmount / creditRate,
                                    exchangeRate: creditRate,
                                    baseDebit: 0,
                                    baseCredit: baseAmount
                                }
                            ]
                        }
                    }
                });

                journalEntryId = entry.id;

                // Link to collection
                await tx.subscriptionCollection.update({
                    where: { id: collection.id },
                    data: { journalEntryId: entry.id }
                });

                // Create individual subscription records (SQLite doesn't support createMany)
                for (const it of items) {
                    const val = it.amount as any;
                    await tx.memberSubscription.create({
                        data: {
                            memberId: it.memberId,
                            year: it.year,
                            amount: (typeof val === 'object' && val !== null) ? Number(val.toString()) : Number(val),
                            journalEntryId: entry.id
                        }
                    });
                }
            }

            return {
                ...collection,
                journalEntryId
            };
        });
    }

    async unpostCollection(id: string, user: { id: string, role: string }) {
        return prisma.$transaction(async (tx) => {
            const collection = await tx.subscriptionCollection.findUnique({
                where: { id },
                include: { items: { include: { member: true } } }
            });

            if (!collection) throw new Error('السجل غير موجود');

            if (user.role === 'ENCARGADO') {
                // Check if any member in the collection belongs to an entity managed by the user
                const member = collection.items[0]?.member;
                if (member) {
                    const ownEntity = await tx.entity.findFirst({
                        where: { id: member.entityId, userId: user.id }
                    });
                    if (!ownEntity) throw new Error('لا تملك صلاحية إلغاء ترحيل هذا السجل');
                }
            }
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
                    userId: user.id,
                    action: 'UNPOST_COLLECTION',
                    entity: 'SubscriptionCollection',
                    entityId: id
                }
            });

            return updated;
        });
    }

    async importMembers(user: { id: string, role: string }, filename: string, rows: any[], defaultYear?: number) {
        let importedCount = 0;
        let errorsCount = 0;
        const errorsDetails: any[] = [];

        // Pre-fetch managed entities if ENCARGADO
        let managedEntityIds: string[] = [];
        if (user.role === 'ENCARGADO') {
            const entities = await prisma.entity.findMany({
                where: { userId: user.id },
                select: { id: true }
            });
            managedEntityIds = entities.map(e => e.id);
        }

        const fallbackYear = defaultYear || new Date().getFullYear();

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            try {
                if (!row.name) throw new Error('الاسم مطلوب');
                if (!row.entityId) throw new Error('الجهة مطلوبة');

                if (user.role === 'ENCARGADO' && !managedEntityIds.includes(String(row.entityId))) {
                    throw new Error('لا تملك صلاحية الاستيراد لهذه الجهة');
                }

                // Use provided year, or defaultYear, or fallback to current year
                const affiliationYear = Number(row.affiliationYear) || fallbackYear;

                const statusInput = row.status?.toUpperCase() || 'ACTIVE';
                const status = statusInput === 'INACTIVE' ? 'INACTIVE' : statusInput === 'DECEASED' ? 'DECEASED' : 'ACTIVE';

                await prisma.member.create({
                    data: {
                        name: String(row.name).trim(),
                        entityId: String(row.entityId),
                        affiliationYear,
                        status,
                        stoppedAt: row.stoppedAt ? new Date(row.stoppedAt) : null,
                        phone: row.phone ? String(row.phone).trim() : null,
                        managerId: row.managerId ? String(row.managerId) : null
                    }
                });

                importedCount++;
            } catch (e: any) {
                errorsCount++;
                errorsDetails.push({ row: i + 1, entityId: row.entityId, name: row.name, error: e.message || 'خطأ غير معروف' });
            }
        }

        const report = await prisma.importReport.create({
            data: {
                filename,
                totalRecords: rows.length,
                importedCount,
                errorsCount,
                errorsDetails: errorsDetails,
                userId: user.id
            }
        });

        // Audit Logging
        await prisma.auditLog.create({
            data: {
                userId: user.id,
                action: 'IMPORT_MEMBERS',
                entity: 'Member',
                entityId: report.id,
                details: { filename, importedCount, errorsCount }
            }
        });

        return report;
    }

    async getImportReports() {
        return prisma.importReport.findMany({
            orderBy: { date: 'desc' },
            include: { user: { select: { name: true } } }
        });
    }
}
