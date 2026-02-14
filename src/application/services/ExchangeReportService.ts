import prisma from '../../infrastructure/database/prisma';

export class ExchangeReportService {
  async getExchangeGainsLosses(startDate?: Date, endDate?: Date) {
    const lines = await prisma.journalLine.findMany({
      where: {
        journalEntry: {
          status: 'POSTED',
          date: { gte: startDate, lte: endDate }
        },
        account: {
          OR: [
            { name: { contains: 'Exchange Gain' } },
            { name: { contains: 'Exchange Loss' } },
            { name: { contains: 'فروقات عملة' } }
          ]
        }
      },
      include: {
        account: true,
        journalEntry: true
      }
    });

    const summary = lines.reduce((acc: any, line: any) => {
      const amount = Number(line.baseCredit) - Number(line.baseDebit);
      acc.total += amount;
      if (amount > 0) acc.gains += amount;
      else acc.losses += Math.abs(amount);
      return acc;
    }, { total: 0, gains: 0, losses: 0 });

    return {
      summary,
      details: lines.map((l: any) => ({
        date: l.journalEntry.date,
        description: l.journalEntry.description,
        accountName: l.account.name,
        amount: Number(l.baseCredit) - Number(l.baseDebit)
      }))
    };
  }
}
