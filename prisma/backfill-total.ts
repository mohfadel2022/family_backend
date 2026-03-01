import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function backfillTotalAmount() {
    console.log('🔄 Backfilling totalAmount for existing journal entries...');

    const entries = await prisma.journalEntry.findMany({
        include: { lines: true }
    });

    let updated = 0;
    for (const entry of entries) {
        const totalAmount = entry.lines.reduce(
            (sum, line) => sum + Number(line.baseDebit),
            0
        );

        await prisma.journalEntry.update({
            where: { id: entry.id },
            data: { totalAmount }
        });

        updated++;
        console.log(`  ✅ Entry #${entry.entryNumber} → totalAmount: ${totalAmount}`);
    }

    console.log(`\n✅ Done! Updated ${updated} entries.`);
    await prisma.$disconnect();
}

backfillTotalAmount().catch((e) => {
    console.error('❌ Error:', e);
    prisma.$disconnect();
    process.exit(1);
});
