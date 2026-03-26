import prisma from './src/infrastructure/database/prisma';
import { SubscriptionReportService } from './src/application/services/SubscriptionReportService';

async function test() {
    const service = new SubscriptionReportService();
    const user = { id: 'admin-id', role: 'ADMIN' }; // Mock admin user
    
    // Find a real admin user ID if possible
    const admin = await prisma.user.findFirst({ where: { role: { name: 'ADMIN' } } });
    if (admin) {
        user.id = admin.id;
    }

    // Check raw DB counts
    const memberCount = await prisma.member.count();
    const subsCount = await prisma.memberSubscription.count();
    const itemsCount = await prisma.subscriptionCollectionItem.count();
    console.log(`DB counts: members=${memberCount}, memberSubscriptions=${subsCount}, collectionItems=${itemsCount}`);

    // Verify the pivot directly from DB first
    const pivotBase = await (service as any).getSubscriptionPivot(user);
    console.log('Base pivot data entities:', pivotBase.data.length, ', years:', pivotBase.years.join(', '));
    
    if (pivotBase.data.length > 0 && pivotBase.data[0].members.length > 0) {
        const firstMember = pivotBase.data[0].members[0];
        console.log('First member name:', firstMember.name);
        console.log('First member subs:', JSON.stringify(firstMember.subscriptions));
        console.log('Year 2023 value:', firstMember.subscriptions[2023], '| String key:', firstMember.subscriptions['2023']);
    }

    console.log('Fetching pivot summary...');
    const result = await service.getSubscriptionSummaryPivot(user);
    console.log('Result:', JSON.stringify(result, null, 2));
    process.exit(0);
}

test().catch(err => {
    console.error(err);
    process.exit(1);
});
