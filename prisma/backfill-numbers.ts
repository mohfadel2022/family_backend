import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function backfillNumbers() {
    console.log('🚀 Starting entryNumber backfill...');

    // Find entries without entryNumber or with null
    const entries = await prisma.journalEntry.findMany({
        where: {
            OR: [
                { entryNumber: null },
                { entryNumber: 0 }
            ]
        },
        orderBy: { createdAt: 'asc' }
    });

    console.log(`🔍 Found ${entries.length} entries without numbers.`);

    if (entries.length === 0) {
        console.log('✅ Nothing to backfill.');
        return;
    }

    // Get the current max number
    const lastEntry = await prisma.journalEntry.findFirst({
        where: { NOT: { entryNumber: null } },
        orderBy: { entryNumber: 'desc' },
        select: { entryNumber: true }
    });

    let nextNumber = (lastEntry?.entryNumber || 0) + 1;

    for (const entry of entries) {
        await prisma.journalEntry.update({
            where: { id: entry.id },
            data: { entryNumber: nextNumber }
        });
        console.log(`  - Entry ID: ${entry.id} assigned number: ${nextNumber}`);
        nextNumber++;
    }

    console.log('🎉 Backfill completed!');
}

backfillNumbers()
    .catch(e => {
        console.error('❌ Error during backfill:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
