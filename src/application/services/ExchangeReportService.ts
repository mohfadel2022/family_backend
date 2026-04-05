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

  async getUnrealizedGainsLosses(branchId?: string, date?: Date) {
    const accounts = await prisma.account.findMany({
      where: {
        currency: { isBase: false },
        branchId: branchId ? branchId : undefined,
      },
      include: {
        currency: true,
        journalLines: {
          where: {
            journalEntry: {
              status: 'POSTED',
              date: date ? { lte: date } : undefined,
            }
          }
        }
      }
    });

    const details = accounts.map(acc => {
      const isNormalDebit = ['ASSET', 'EXPENSE'].includes(acc.type);
      
      const foreignDebit = acc.journalLines.reduce((sum, l) => sum + Number(l.debit), 0);
      const foreignCredit = acc.journalLines.reduce((sum, l) => sum + Number(l.credit), 0);
      const foreignBalance = isNormalDebit ? foreignDebit - foreignCredit : foreignCredit - foreignDebit;

      const baseDebit = acc.journalLines.reduce((sum, l) => sum + Number(l.baseDebit), 0);
      const baseCredit = acc.journalLines.reduce((sum, l) => sum + Number(l.baseCredit), 0);
      const bookValue = isNormalDebit ? baseDebit - baseCredit : baseCredit - baseDebit;

      const currentRate = Number(acc.currency?.exchangeRate) || 1;
      const marketValue = foreignBalance * currentRate;

      // For Assets: Market Value > Book Value = Gain.
      // For Liabilities: Market Value > Book Value = Loss.
      const rawDiff = marketValue - bookValue;
      const unrealizedPnL = isNormalDebit ? rawDiff : -rawDiff;

      return {
        id: acc.id,
        code: acc.code,
        accountName: acc.name,
        currencyCode: acc.currency?.code,
        foreignBalance,
        avgBookRate: foreignBalance !== 0 ? Math.abs(bookValue / foreignBalance) : currentRate,
        currentRate,
        bookValue,
        marketValue,
        unrealizedPnL
      };
    }).filter(d => d.foreignBalance !== 0);

    const summary = details.reduce((acc, d) => {
      acc.total += d.unrealizedPnL;
      if (d.unrealizedPnL > 0) acc.gains += d.unrealizedPnL;
      else acc.losses += Math.abs(d.unrealizedPnL);
      return acc;
    }, { total: 0, gains: 0, losses: 0 });

    return { summary, details };
  }
}
