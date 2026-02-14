import prisma from '../../infrastructure/database/prisma';

export class PeriodService {
  async createPeriod(name: string, startDate: Date, endDate: Date) {
    return prisma.period.create({
      data: { name, startDate, endDate, isLocked: false }
    });
  }

  async toggleLock(id: string) {
    const period = await prisma.period.findUnique({ where: { id } });
    if (!period) throw new Error('Period not found');
    
    return prisma.period.update({
      where: { id },
      data: { isLocked: !period.isLocked }
    });
  }

  async isDateLocked(date: Date): Promise<boolean> {
    const period = await prisma.period.findFirst({
      where: {
        startDate: { lte: date },
        endDate: { gte: date },
        isLocked: true
      }
    });
    return !!period;
  }

  async getAllPeriods() {
    return prisma.period.findMany({
      orderBy: { startDate: 'desc' }
    });
  }
}
