import prisma from './src/infrastructure/database/prisma';

async function main() {
    console.log('Starting migration: Copying entityId to paymentEntityId for ALL members...');
    
    // Perform an absolute sync: paymentEntityId = entityId for everyone.
    const result = await prisma.$executeRaw`
        UPDATE Member 
        SET paymentEntityId = entityId
    `;
    
    console.log(`Migration complete. Synced ${result} members.`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
