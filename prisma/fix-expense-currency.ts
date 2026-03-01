import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function fixExpenseCurrency() {
    try {
        // 1. Buscar monedas
        const [eur, dzd] = await prisma.$transaction([
            prisma.currency.findFirst({ where: { code: 'EUR' } }),
            prisma.currency.findFirst({ where: { code: 'DZD' } })
        ]);

        if (!eur || !dzd) {
            throw new Error('Could not find EUR or DZD currency');
        }

        console.log(`EUR ID: ${eur.id}`);
        console.log(`DZD ID: ${dzd.id}`);

        // 2. Preview (sin include pesado)
        const countLines = await prisma.journalLine.count({
            where: {
                currencyId: eur.id,
                account: { type: 'EXPENSE' }
            }
        });

        console.log(`🔍 Expense lines with EUR: ${countLines}`);

        if (countLines === 0) {
            console.log('Nothing to update');
            return;
        }

        // 3. Actualización en una sola transacción
        const [lineResult, accountResult] = await prisma.$transaction([
            prisma.journalLine.updateMany({
                where: {
                    currencyId: eur.id,
                    account: { type: 'EXPENSE' }
                },
                data: { currencyId: dzd.id }
            }),
            prisma.account.updateMany({
                where: {
                    type: 'EXPENSE',
                    currencyId: eur.id
                },
                data: { currencyId: dzd.id }
            })
        ]);

        console.log(`✅ Updated journal lines: ${lineResult.count}`);
        console.log(`✅ Updated accounts: ${accountResult.count}`);
        console.log('🎉 Done!');
    } catch (e) {
        console.error('❌ Error:', e);
    } finally {
        await prisma.$disconnect();
    }
}

fixExpenseCurrency();