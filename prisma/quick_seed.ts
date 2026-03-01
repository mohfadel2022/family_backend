import { PrismaClient } from '@prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';

async function quickSeed() {
    const adapter = new PrismaBetterSqlite3({ url: 'prisma/dev.db' });
    const prisma = new PrismaClient({ adapter });

    try {
        const dzd = await prisma.currency.findFirst({ where: { code: 'DZD' } });
        const branch = await prisma.branch.findFirst();
        const admin = await prisma.user.findFirst({ where: { username: 'admin' } });

        if (!dzd || !branch || !admin) {
            console.error('Missing prerequisites for quick seed');
            return;
        }

        const entity1 = await prisma.entity.create({
            data: {
                name: 'جمعية الغد',
                code: 'YOUTH',
                currencyId: dzd.id,
                branchId: branch.id,
                annualSubscription: 150,
            }
        });

        const member1 = await prisma.member.create({
            data: {
                name: 'أحمد بن محمد',
                entityId: entity1.id,
                affiliationYear: 2023,
                status: 'ACTIVE'
            }
        });

        const member2 = await prisma.member.create({
            data: {
                name: 'سارة عبد الله',
                entityId: entity1.id,
                affiliationYear: 2024,
                status: 'ACTIVE'
            }
        });

        console.log('Quick seed finished: 1 entity, 2 members created.');
    } finally {
        await prisma.$disconnect();
    }
}

quickSeed();
