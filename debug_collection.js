const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkCollection() {
    const collId = '35ae6428-1259-48bc-a2ac-85159cdaa57e';
    const coll = await prisma.subscriptionCollection.findUnique({
        where: { id: collId },
        include: {
            debitAccount: {
                include: {
                    currency: true
                }
            },
            journalEntry: {
                include: {
                    branch: {
                        include: {
                            currency: true
                        }
                    }
                }
            }
        }
    });

    if (!coll) {
        console.log('Collection NOT FOUND');
        return;
    }

    console.log('Collection:', JSON.stringify({
        id: coll.id,
        status: coll.status,
        debitAccountName: coll.debitAccount?.name,
        debitAccountCurrency: coll.debitAccount?.currency?.code,
        debitAccountSymbol: coll.debitAccount?.currency?.symbol,
        branchCurrency: coll.journalEntry?.branch?.currency?.code
    }, null, 2));

    // Check MemberSubscriptions linked to this collection
    const subs = await prisma.memberSubscription.findMany({
        where: { journalEntryId: coll.journalEntryId },
        take: 3
    });
    console.log('Sample MemberSubscriptions:', JSON.stringify(subs, null, 2));
}

checkCollection().catch(console.error).finally(() => prisma.$disconnect());
