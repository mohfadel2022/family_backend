import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  try {
    console.log('Resetting and Seeding fresh data...');

    // Clear existing data in order
    await prisma.journalLine.deleteMany();
    await prisma.journalEntry.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.account.deleteMany();
    await prisma.branch.deleteMany();
    await prisma.period.deleteMany();
    await prisma.currency.deleteMany();
    await prisma.user.deleteMany();

    // 1. New Base Currency (EUR instead of SAR)
    const eur = await prisma.currency.create({
      data: { name: 'يورو', code: 'EUR', symbol: '€', isBase: true },
    });

    const dzd = await prisma.currency.create({
      data: { name: 'دينار جزائري', code: 'DZD', symbol: 'د.ج', isBase: false },
    });

    // 2. Admin User
    const hashedPassword = await bcrypt.hash('admin123', 10);
    const admin = await prisma.user.create({
      data: {
        username: 'admin',
        password: hashedPassword,
        name: 'مدير النظام',
        role: 'ADMIN',
      },
    });

    // 3. One Main Branch to start with
    const mainBranch = await prisma.branch.create({
      data: { name: 'المركز الرئيسي', code: 'MAIN', currencyId: eur.id },
    });

    // 4. Create Comprehensive Chart of Accounts for Charity Fund

    // ============ ASSETS (الأصول) ============
    const assetsParent = await prisma.account.create({
      data: {
        name: 'الأصول',
        code: '1000',
        type: 'ASSET',
        currencyId: eur.id,
        branchId: mainBranch.id,
      },
    });

    // Cash Accounts by Currency (الصناديق النقدية)
    const cashParent = await prisma.account.create({
      data: {
        name: 'الصناديق النقدية',
        code: '1100',
        type: 'ASSET',
        currencyId: eur.id,
        branchId: mainBranch.id,
        parentId: assetsParent.id,
      },
    });

    // EUR Cash
    const cashEurParent = await prisma.account.create({
      data: {
        name: 'صندوق اليورو',
        code: '1110',
        type: 'ASSET',
        currencyId: eur.id,
        branchId: mainBranch.id,
        parentId: cashParent.id,
      },
    });

    await prisma.account.create({
      data: {
        name: 'صندوق اليورو - نقدي',
        code: '1111',
        type: 'ASSET',
        currencyId: eur.id,
        branchId: mainBranch.id,
        parentId: cashEurParent.id,
      },
    });

    await prisma.account.create({
      data: {
        name: 'صندوق اليورو - بنك',
        code: '1112',
        type: 'ASSET',
        currencyId: eur.id,
        branchId: mainBranch.id,
        parentId: cashEurParent.id,
      },
    });

    // DZD Cash
    const cashDzdParent = await prisma.account.create({
      data: {
        name: 'صندوق الدينار الجزائري',
        code: '1120',
        type: 'ASSET',
        currencyId: dzd.id,
        branchId: mainBranch.id,
        parentId: cashParent.id,
      },
    });

    await prisma.account.create({
      data: {
        name: 'صندوق الدينار - نقدي',
        code: '1121',
        type: 'ASSET',
        currencyId: dzd.id,
        branchId: mainBranch.id,
        parentId: cashDzdParent.id,
      },
    });

    await prisma.account.create({
      data: {
        name: 'صندوق الدينار - بنك',
        code: '1122',
        type: 'ASSET',
        currencyId: dzd.id,
        branchId: mainBranch.id,
        parentId: cashDzdParent.id,
      },
    });

    // Receivables
    await prisma.account.create({
      data: {
        name: 'مستحقات على الأعضاء',
        code: '1200',
        type: 'ASSET',
        currencyId: eur.id,
        branchId: mainBranch.id,
        parentId: assetsParent.id,
      },
    });

    // ============ LIABILITIES (الالتزامات) ============
    const liabilitiesParent = await prisma.account.create({
      data: {
        name: 'الالتزامات',
        code: '2000',
        type: 'LIABILITY',
        currencyId: eur.id,
        branchId: mainBranch.id,
      },
    });

    await prisma.account.create({
      data: {
        name: 'مساعدات مستحقة للمستفيدين',
        code: '2100',
        type: 'LIABILITY',
        currencyId: eur.id,
        branchId: mainBranch.id,
        parentId: liabilitiesParent.id,
      },
    });

    await prisma.account.create({
      data: {
        name: 'مصروفات مستحقة',
        code: '2200',
        type: 'LIABILITY',
        currencyId: eur.id,
        branchId: mainBranch.id,
        parentId: liabilitiesParent.id,
      },
    });

    // ============ REVENUE (الإيرادات) - with currency sub-accounts ============
    const revenueParent = await prisma.account.create({
      data: {
        name: 'الإيرادات',
        code: '4000',
        type: 'REVENUE',
        currencyId: eur.id,
        branchId: mainBranch.id,
      },
    });

    // Donations (التبرعات النقدية)
    const donationsParent = await prisma.account.create({
      data: {
        name: 'التبرعات النقدية',
        code: '4100',
        type: 'REVENUE',
        currencyId: eur.id,
        branchId: mainBranch.id,
        parentId: revenueParent.id,
      },
    });

    await prisma.account.create({
      data: {
        name: 'تبرعات باليورو',
        code: '4110',
        type: 'REVENUE',
        currencyId: eur.id,
        branchId: mainBranch.id,
        parentId: donationsParent.id,
      },
    });

    await prisma.account.create({
      data: {
        name: 'تبرعات بالدينار الجزائري',
        code: '4120',
        type: 'REVENUE',
        currencyId: dzd.id,
        branchId: mainBranch.id,
        parentId: donationsParent.id,
      },
    });

    // Member Contributions (مساهمات الأعضاء)
    const contributionsParent = await prisma.account.create({
      data: {
        name: 'مساهمات الأعضاء الشهرية',
        code: '4200',
        type: 'REVENUE',
        currencyId: eur.id,
        branchId: mainBranch.id,
        parentId: revenueParent.id,
      },
    });

    await prisma.account.create({
      data: {
        name: 'مساهمات باليورو',
        code: '4210',
        type: 'REVENUE',
        currencyId: eur.id,
        branchId: mainBranch.id,
        parentId: contributionsParent.id,
      },
    });

    await prisma.account.create({
      data: {
        name: 'مساهمات بالدينار الجزائري',
        code: '4220',
        type: 'REVENUE',
        currencyId: dzd.id,
        branchId: mainBranch.id,
        parentId: contributionsParent.id,
      },
    });

    // Investment Income (إيرادات استثمارية)
    const investmentIncomeParent = await prisma.account.create({
      data: {
        name: 'إيرادات استثمارية',
        code: '4300',
        type: 'REVENUE',
        currencyId: eur.id,
        branchId: mainBranch.id,
        parentId: revenueParent.id,
      },
    });

    await prisma.account.create({
      data: {
        name: 'إيرادات استثمارية باليورو',
        code: '4310',
        type: 'REVENUE',
        currencyId: eur.id,
        branchId: mainBranch.id,
        parentId: investmentIncomeParent.id,
      },
    });

    await prisma.account.create({
      data: {
        name: 'إيرادات استثمارية بالدينار',
        code: '4320',
        type: 'REVENUE',
        currencyId: dzd.id,
        branchId: mainBranch.id,
        parentId: investmentIncomeParent.id,
      },
    });

    // Miscellaneous Income (إيرادات متنوعة)
    const miscIncomeParent = await prisma.account.create({
      data: {
        name: 'إيرادات متنوعة',
        code: '4900',
        type: 'REVENUE',
        currencyId: eur.id,
        branchId: mainBranch.id,
        parentId: revenueParent.id,
      },
    });

    await prisma.account.create({
      data: {
        name: 'إيرادات متنوعة باليورو',
        code: '4910',
        type: 'REVENUE',
        currencyId: eur.id,
        branchId: mainBranch.id,
        parentId: miscIncomeParent.id,
      },
    });

    await prisma.account.create({
      data: {
        name: 'إيرادات متنوعة بالدينار',
        code: '4920',
        type: 'REVENUE',
        currencyId: dzd.id,
        branchId: mainBranch.id,
        parentId: miscIncomeParent.id,
      },
    });

    // ============ EXPENSES (المصروفات) ============
    const expensesParent = await prisma.account.create({
      data: {
        name: 'المصروفات',
        code: '5000',
        type: 'EXPENSE',
        currencyId: eur.id,
        branchId: mainBranch.id,
      },
    });

    // Charitable Expenses (المساعدات الخيرية)
    const charitableExpensesParent = await prisma.account.create({
      data: {
        name: 'المساعدات الخيرية',
        code: '5100',
        type: 'EXPENSE',
        currencyId: eur.id,
        branchId: mainBranch.id,
        parentId: expensesParent.id,
      },
    });

    await prisma.account.create({
      data: {
        name: 'مساعدات طبية',
        code: '5110',
        type: 'EXPENSE',
        currencyId: eur.id,
        branchId: mainBranch.id,
        parentId: charitableExpensesParent.id,
      },
    });

    await prisma.account.create({
      data: {
        name: 'مساعدات تعليمية',
        code: '5120',
        type: 'EXPENSE',
        currencyId: eur.id,
        branchId: mainBranch.id,
        parentId: charitableExpensesParent.id,
      },
    });

    await prisma.account.create({
      data: {
        name: 'مساعدات معيشية',
        code: '5130',
        type: 'EXPENSE',
        currencyId: eur.id,
        branchId: mainBranch.id,
        parentId: charitableExpensesParent.id,
      },
    });

    await prisma.account.create({
      data: {
        name: 'مساعدات طارئة',
        code: '5140',
        type: 'EXPENSE',
        currencyId: eur.id,
        branchId: mainBranch.id,
        parentId: charitableExpensesParent.id,
      },
    });

    // Administrative Expenses (المصروفات الإدارية)
    const adminExpensesParent = await prisma.account.create({
      data: {
        name: 'المصروفات الإدارية',
        code: '5200',
        type: 'EXPENSE',
        currencyId: eur.id,
        branchId: mainBranch.id,
        parentId: expensesParent.id,
      },
    });

    await prisma.account.create({
      data: {
        name: 'رسوم بنكية',
        code: '5210',
        type: 'EXPENSE',
        currencyId: eur.id,
        branchId: mainBranch.id,
        parentId: adminExpensesParent.id,
      },
    });

    await prisma.account.create({
      data: {
        name: 'مصروفات قرطاسية ومطبوعات',
        code: '5220',
        type: 'EXPENSE',
        currencyId: eur.id,
        branchId: mainBranch.id,
        parentId: adminExpensesParent.id,
      },
    });

    await prisma.account.create({
      data: {
        name: 'مصروفات اتصالات',
        code: '5230',
        type: 'EXPENSE',
        currencyId: eur.id,
        branchId: mainBranch.id,
        parentId: adminExpensesParent.id,
      },
    });

    await prisma.account.create({
      data: {
        name: 'مصروفات متنوعة',
        code: '5290',
        type: 'EXPENSE',
        currencyId: eur.id,
        branchId: mainBranch.id,
        parentId: adminExpensesParent.id,
      },
    });

    console.log('Clean seed completed successfully!');
    console.log('Created:', {
      currencies: 2,
      users: 1,
      branches: 1,
      accounts: 36,
      structure: {
        assets: '10 accounts (1 parent, 1 cash parent, 2 currency parents, 5 leaf, 1 receivables)',
        liabilities: '3 accounts (1 parent, 2 leaf)',
        revenue: '17 accounts (1 parent, 4 category parents, 12 currency leaf)',
        expenses: '11 accounts (1 parent, 2 sub-parents, 8 leaf)',
      }
    });

  } catch (e) {
    console.error('Seed failed:', e);
  } finally {
    await prisma.$disconnect(); // Asegura que Prisma se cierre correctamente
  }
}

main();