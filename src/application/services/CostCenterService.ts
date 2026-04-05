import prisma from '../../infrastructure/database/prisma';

export class CostCenterService {
  async getCostCenters(branchId?: string) {
    const where = branchId ? { branchId } : {};
    return await prisma.costCenter.findMany({
      where,
      orderBy: { code: 'asc' },
      include: {
        branch: { select: { id: true, name: true, code: true } },
        parent: { select: { id: true, name: true, code: true } },
        _count: { select: { children: true } }
      }
    });
  }

  async getCostCenterById(id: string) {
    const costCenter = await prisma.costCenter.findUnique({
      where: { id },
      include: {
        branch: { select: { id: true, name: true, code: true } }
      }
    });
    if (!costCenter) throw new Error('مركز التكلفة غير موجود');
    return costCenter;
  }

  async generateNextCode(parentId: string | null): Promise<string> {
    if (!parentId) {
      // Auto-generate Principal Code: CC-01, CC-02...
      const principals = await prisma.costCenter.findMany({
        where: { parentId: null },
        select: { code: true }
      });
      
      const numericParts = principals
        .map(p => {
          const match = p.code.match(/^CC-(\d+)$/);
          return match ? parseInt(match[1], 10) : null;
        })
        .filter((n): n is number => n !== null);

      const nextNum = numericParts.length > 0 ? Math.max(...numericParts) + 1 : 1;
      return `CC-${nextNum.toString().padStart(2, '0')}`;
    } else {
      // Auto-generate Secondary Code: CC-01-01, CC-01-02...
      const parent = await prisma.costCenter.findUnique({
        where: { id: parentId },
        select: { code: true }
      });
      if (!parent) throw new Error('المركز الرئيسي غير موجود');

      const children = await prisma.costCenter.findMany({
        where: { parentId: parentId },
        select: { code: true }
      });

      const prefix = `${parent.code}-`;
      const suffixes = children
        .map(c => {
          if (c.code.startsWith(prefix)) {
            const suffix = c.code.substring(prefix.length);
            const match = suffix.match(/^(\d+)$/);
            return match ? parseInt(match[1], 10) : null;
          }
          return null;
        })
        .filter((n): n is number => n !== null);

      const nextNum = suffixes.length > 0 ? Math.max(...suffixes) + 1 : 1;
      return `${prefix}${nextNum.toString().padStart(2, '0')}`;
    }
  }

  async getNextAvailableCode(parentId: string | null) {
    return await this.generateNextCode(parentId);
  }

  async createCostCenter(data: { name: string; code?: string; status?: string; branchId: string; parentId?: string | null }) {
    let finalCode = data.code?.trim();

    if (!finalCode) {
      finalCode = await this.generateNextCode(data.parentId || null);
    }

    const existing = await prisma.costCenter.findUnique({ where: { code: finalCode } });
    if (existing) throw new Error(`كود مركز التكلفة (${finalCode}) موجود مسبقاً`);

    return await prisma.costCenter.create({
      data: {
        name: data.name,
        code: finalCode,
        status: data.status || 'ACTIVE',
        branchId: data.branchId,
        parentId: data.parentId || null
      }
    });
  }

  async updateCostCenter(id: string, data: { name?: string; code?: string; status?: string; branchId?: string; parentId?: string | null }) {
    if (data.code) {
      const existing = await prisma.costCenter.findFirst({
        where: { code: data.code, id: { not: id } }
      });
      if (existing) throw new Error('كود مركز التكلفة مستخدم من قبل مركز آخر');
    }

    // Prevent making a cost center its own parent
    if (data.parentId === id) {
      throw new Error('لا يمكن أن يكون مركز التكلفة أب لنفسه');
    }

    return await prisma.costCenter.update({
      where: { id },
      data
    });
  }

  async deleteCostCenter(id: string) {
    // Check if there are children
    const childrenCount = await prisma.costCenter.count({
      where: { parentId: id }
    });
    if (childrenCount > 0) {
      throw new Error('لا يمكن حذف مركز التكلفة لوجود مراكز تكلفة تابعة له');
    }

    // Check if there are journal lines using this cost center
    const assignmentsCount = await prisma.journalLineCostCenter.count({
      where: { costCenterId: id }
    });
    if (assignmentsCount > 0) {
      throw new Error('لا يمكن حذف مركز التكلفة لوجود حركات مالية مرتبطة به');
    }

    return await prisma.costCenter.delete({
      where: { id }
    });
  }

  async getCostCenterSummaryReport(branchId?: string, startDate?: Date, endDate?: Date, accountId?: string) {
    const costCenters = await prisma.costCenter.findMany({
      where: branchId ? { branchId } : undefined,
      include: {
        journalLines: {
          where: {
            line: {
              accountId: accountId || undefined,
              journalEntry: {
                status: 'POSTED',
                date: {
                  gte: startDate,
                  lte: endDate
                }
              },
              account: {
                type: { in: ['REVENUE', 'EXPENSE'] }
              }
            }
          },
          include: {
            line: {
              include: { account: true }
            }
          }
        }
      }
    });

    const flatReports = costCenters.map(cc => {
      let totalRevenue = 0;
      let totalExpense = 0;

      cc.journalLines.forEach(assignment => {
        const line = assignment.line;
        const percentage = Number(assignment.percentage) / 100;
        
        if (line.account.type === 'REVENUE') {
          totalRevenue += (Number(line.baseCredit) - Number(line.baseDebit)) * percentage;
        } else if (line.account.type === 'EXPENSE') {
          totalExpense += (Number(line.baseDebit) - Number(line.baseCredit)) * percentage;
        }
      });

      return {
        id: cc.id,
        code: cc.code,
        name: cc.name,
        parentId: cc.parentId,
        totalRevenue,
        totalExpense,
        netBalance: totalRevenue - totalExpense
      };
    });

    // Group into Principals and Secondaries
    const principals = flatReports.filter(r => !r.parentId);
    const secondaries = flatReports.filter(r => r.parentId);

    return principals.map(p => {
      const children = secondaries.filter(s => s.parentId === p.id);
      
      // Calculate Aggregate totals for Principal (sum of children + principal's own)
      const aggregateRevenue = p.totalRevenue + children.reduce((sum, c) => sum + c.totalRevenue, 0);
      const aggregateExpense = p.totalExpense + children.reduce((sum, c) => sum + c.totalExpense, 0);

      return {
        ...p,
        totalRevenue: aggregateRevenue,
        totalExpense: aggregateExpense,
        netBalance: aggregateRevenue - aggregateExpense,
        secondaryCenters: children
      };
    }).sort((a, b) => (a.code || '').localeCompare(b.code || ''));
  }

  async getCostCenterDetailsReport(costCenterId: string, startDate?: Date, endDate?: Date, accountId?: string) {
    const costCenter = await prisma.costCenter.findUnique({ where: { id: costCenterId } });
    if (!costCenter) throw new Error('Cost center not found');

    const assignments = await prisma.journalLineCostCenter.findMany({
      where: {
        costCenterId,
        line: {
          accountId: accountId || undefined,
          journalEntry: {
            status: 'POSTED',
            date: {
              gte: startDate,
              lte: endDate
            }
          }
        }
      },
      include: {
        line: {
          include: {
            journalEntry: true,
            account: true,
            currency: true
          }
        }
      },
      orderBy: {
        line: {
          journalEntry: {
            date: 'asc'
          }
        }
      }
    });

    const entries = assignments.map(a => {
      const line = a.line;
      const percentage = Number(a.percentage) / 100;
      
      return {
        date: line.journalEntry.date,
        entryNumber: line.journalEntry.entryNumber,
        description: line.journalEntry.description,
        accountCode: line.account.code,
        accountName: line.account.name,
        accountType: line.account.type,
        currency: line.currency.code,
        debit: Number(line.debit) * percentage,
        credit: Number(line.credit) * percentage,
        baseDebit: Number(line.baseDebit) * percentage,
        baseCredit: Number(line.baseCredit) * percentage,
        distributionPercent: Number(a.percentage)
      };
    });

    return {
      id: costCenter.id,
      code: costCenter.code,
      name: costCenter.name,
      entries
    };
  }

  async getVouchersMissingCostCenters(branchId?: string) {
    const where: any = {
      status: 'POSTED',
      lines: {
        some: {
          account: {
            OR: [
              { code: { startsWith: '4' } },
              { code: { startsWith: '5' } }
            ]
          },
          costCenters: {
            none: {}
          }
        }
      }
    };

    if (branchId) {
      where.branchId = branchId;
    }

    return await prisma.journalEntry.findMany({
      where,
      include: {
        branch: { select: { id: true, name: true, code: true } },
        user: { select: { id: true, name: true } },
        subscriptionCollection: { select: { id: true } },
        lines: {
          include: {
            account: { select: { id: true, name: true, code: true } },
            currency: { select: { id: true, name: true, code: true, symbol: true } },
            costCenters: {
              include: {
                costCenter: { select: { id: true, name: true, code: true } }
              }
            }
          }
        }
      },
      orderBy: { date: 'desc' }
    });
  }

  async updateVoucherDistributions(voucherId: string, distributions: { lineId: string, costCenters: { costCenterId: string, percentage: number }[] }[]) {
    return await prisma.$transaction(async (tx: any) => {
      for (const dist of distributions) {
        // Simple validation: if distributions are provided, they must sum to 100
        if (dist.costCenters.length > 0) {
          const total = dist.costCenters.reduce((sum, cc) => sum + Number(cc.percentage), 0);
          if (Math.round(total) !== 100) {
             throw new Error(`Total percentage for line must be 100, got ${total}`);
          }

          // Delete old distributions for this line
          await tx.journalLineCostCenter.deleteMany({
            where: { lineId: dist.lineId, line: { journalEntryId: voucherId } }
          });

          // Create new ones
          await tx.journalLineCostCenter.createMany({
            data: dist.costCenters.map(cc => ({
              lineId: dist.lineId,
              costCenterId: cc.costCenterId,
              percentage: cc.percentage
            }))
          });
        }
      }

      return await tx.journalEntry.findUnique({
        where: { id: voucherId },
        include: { 
          lines: { 
            include: { 
              account: { select: { id: true, name: true, code: true } }, 
              costCenters: { include: { costCenter: { select: { id: true, name: true, code: true } } } } 
            } 
          } 
        }
      });
    });
  }
}
