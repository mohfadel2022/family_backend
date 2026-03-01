import { PrismaClient } from '@prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';

const adapter = new PrismaBetterSqlite3({ url: 'prisma/dev.db' });
const prisma  = new PrismaClient({ adapter });

async function main() {
  try {
    console.log('🌱 Seeding exported data...');

    // ── Clear ────────────────────────────────────────────────────────────
    await prisma.subscriptionCollectionItem.deleteMany();
    await prisma.subscriptionCollection.deleteMany();
    await prisma.memberSubscription.deleteMany();
    await prisma.member.deleteMany();
    await prisma.entity.deleteMany();
    await prisma.currencyRateHistory.deleteMany();
    await prisma.journalLine.deleteMany();
    await prisma.journalEntry.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.account.deleteMany();
    await prisma.branch.deleteMany();
    await prisma.period.deleteMany();
    await prisma.currency.deleteMany();
    await prisma.user.deleteMany();

    // ── Currencies ───────────────────────────────────────────────────────
    const cur_dzd = await prisma.currency.create({ data: {
      name: "دينار جزائري", code: "DZD", symbol: "د.ج",
      isBase: true, exchangeRate: 1,
    }});
    const cur_eur = await prisma.currency.create({ data: {
      name: "يورو", code: "EUR", symbol: "€",
      isBase: false, exchangeRate: 250,
    }});
    const cur_mad = await prisma.currency.create({ data: {
      name: "درهم مغربي", code: "MAD", symbol: "د.م",
      isBase: false, exchangeRate: 13,
    }});
    const cur_mru = await prisma.currency.create({ data: {
      name: "أوقية موريتانية", code: "MRU", symbol: "UM",
      isBase: false, exchangeRate: 3.5,
    }});

    // ── Currency Rate History ────────────────────────────────────────────
    await prisma.currencyRateHistory.create({ data: {
      currencyId: cur_eur.id, rate: 240, date: new Date("2026-02-28T00:00:00.000Z"),
    }});
    await prisma.currencyRateHistory.create({ data: {
      currencyId: cur_dzd.id, rate: 1, date: new Date("2026-03-01T01:05:26.111Z"),
    }});
    await prisma.currencyRateHistory.create({ data: {
      currencyId: cur_mru.id, rate: 3.5, date: new Date("2026-03-01T01:05:26.205Z"),
    }});
    await prisma.currencyRateHistory.create({ data: {
      currencyId: cur_mad.id, rate: 13, date: new Date("2026-03-01T01:05:26.220Z"),
    }});
    await prisma.currencyRateHistory.create({ data: {
      currencyId: cur_eur.id, rate: 250, date: new Date("2026-03-01T15:16:46.919Z"),
    }});

    // ── Users ────────────────────────────────────────────────────────────
    const usr_admin = await prisma.user.create({ data: {
      username: "admin", name: "مدير النظام",
      password: "$2b$10$Nmr9e8d6bcGu0emZmzfBJujyBuCd.G8E8puFVUovzOwxtEHx7./Xq", // bcrypt hash
      role: "ADMIN",
    }});
    const usr_mohfadel = await prisma.user.create({ data: {
      username: "mohfadel", name: "محمد فاضل",
      password: "123456", // bcrypt hash
      role: "USER",
    }});
    const usr_mohsalem = await prisma.user.create({ data: {
      username: "mohsalem", name: "محمد سالم",
      password: "123456", // bcrypt hash
      role: "USER",
    }});

    // ── Branches ─────────────────────────────────────────────────────────
    const br_main = await prisma.branch.create({ data: {
      name: "المركز الرئيسي", code: "MAIN", currencyId: cur_dzd.id,
    }});

    // ── Chart of Accounts ────────────────────────────────────────────────
    const acc_1000 = await prisma.account.create({ data: {
      name: "الأصول", code: "1000", type: "ASSET",
      currencyId: cur_dzd.id, branchId: br_main.id,
    }});
    const acc_1100 = await prisma.account.create({ data: {
      name: "الصناديق النقدية", code: "1100", type: "ASSET",
      currencyId: cur_dzd.id, branchId: br_main.id, parentId: acc_1000.id,
    }});
    const acc_1110 = await prisma.account.create({ data: {
      name: "صندوق اليورو", code: "1110", type: "ASSET",
      currencyId: cur_eur.id, branchId: br_main.id, parentId: acc_1100.id,
    }});
    const acc_1111 = await prisma.account.create({ data: {
      name: "صندوق اليورو - نقدي", code: "1111", type: "ASSET",
      currencyId: cur_eur.id, branchId: br_main.id, parentId: acc_1110.id,
    }});
    const acc_1120 = await prisma.account.create({ data: {
      name: "صندوق الدينار الجزائري", code: "1120", type: "ASSET",
      currencyId: cur_dzd.id, branchId: br_main.id, parentId: acc_1100.id,
    }});
    const acc_1121 = await prisma.account.create({ data: {
      name: "صندوق الدينار - نقدي", code: "1121", type: "ASSET",
      currencyId: cur_dzd.id, branchId: br_main.id, parentId: acc_1120.id,
    }});
    const acc_1200 = await prisma.account.create({ data: {
      name: "مستحقات على الأعضاء", code: "1200", type: "ASSET",
      currencyId: cur_dzd.id, branchId: br_main.id, parentId: acc_1000.id,
    }});
    const acc_2000 = await prisma.account.create({ data: {
      name: "الالتزامات", code: "2000", type: "LIABILITY",
      currencyId: cur_dzd.id, branchId: br_main.id,
    }});
    const acc_2100 = await prisma.account.create({ data: {
      name: "مساعدات مستحقة للمستفيدين", code: "2100", type: "LIABILITY",
      currencyId: cur_dzd.id, branchId: br_main.id, parentId: acc_2000.id,
    }});
    const acc_2200 = await prisma.account.create({ data: {
      name: "مصروفات مستحقة", code: "2200", type: "LIABILITY",
      currencyId: cur_dzd.id, branchId: br_main.id, parentId: acc_2000.id,
    }});
    const acc_4000 = await prisma.account.create({ data: {
      name: "الإيرادات", code: "4000", type: "REVENUE",
      currencyId: cur_dzd.id, branchId: br_main.id,
    }});
    const acc_4100 = await prisma.account.create({ data: {
      name: "التبرعات النقدية", code: "4100", type: "REVENUE",
      currencyId: cur_dzd.id, branchId: br_main.id, parentId: acc_4000.id,
    }});
    const acc_4110 = await prisma.account.create({ data: {
      name: "تبرعات باليورو", code: "4110", type: "REVENUE",
      currencyId: cur_eur.id, branchId: br_main.id, parentId: acc_4100.id,
    }});
    const acc_4120 = await prisma.account.create({ data: {
      name: "تبرعات بالدينار الجزائري", code: "4120", type: "REVENUE",
      currencyId: cur_dzd.id, branchId: br_main.id, parentId: acc_4100.id,
    }});
    const acc_4200 = await prisma.account.create({ data: {
      name: "مساهمات الأعضاء الشهرية", code: "4200", type: "REVENUE",
      currencyId: cur_dzd.id, branchId: br_main.id, parentId: acc_4000.id,
    }});
    const acc_4210 = await prisma.account.create({ data: {
      name: "مساهمات باليورو", code: "4210", type: "REVENUE",
      currencyId: cur_eur.id, branchId: br_main.id, parentId: acc_4200.id,
    }});
    const acc_4220 = await prisma.account.create({ data: {
      name: "مساهمات بالدينار الجزائري", code: "4220", type: "REVENUE",
      currencyId: cur_dzd.id, branchId: br_main.id, parentId: acc_4200.id,
    }});
    const acc_4300 = await prisma.account.create({ data: {
      name: "إيرادات استثمارية", code: "4300", type: "REVENUE",
      currencyId: cur_dzd.id, branchId: br_main.id, parentId: acc_4000.id,
    }});
    const acc_4310 = await prisma.account.create({ data: {
      name: "إيرادات استثمارية باليورو", code: "4310", type: "REVENUE",
      currencyId: cur_eur.id, branchId: br_main.id, parentId: acc_4300.id,
    }});
    const acc_4320 = await prisma.account.create({ data: {
      name: "إيرادات استثمارية بالدينار", code: "4320", type: "REVENUE",
      currencyId: cur_dzd.id, branchId: br_main.id, parentId: acc_4300.id,
    }});
    const acc_4900 = await prisma.account.create({ data: {
      name: "إيرادات متنوعة", code: "4900", type: "REVENUE",
      currencyId: cur_dzd.id, branchId: br_main.id, parentId: acc_4000.id,
    }});
    const acc_4910 = await prisma.account.create({ data: {
      name: "إيرادات متنوعة باليورو", code: "4910", type: "REVENUE",
      currencyId: cur_eur.id, branchId: br_main.id, parentId: acc_4900.id,
    }});
    const acc_4920 = await prisma.account.create({ data: {
      name: "إيرادات متنوعة بالدينار", code: "4920", type: "REVENUE",
      currencyId: cur_dzd.id, branchId: br_main.id, parentId: acc_4900.id,
    }});
    const acc_5000 = await prisma.account.create({ data: {
      name: "المصروفات", code: "5000", type: "EXPENSE",
      currencyId: cur_dzd.id, branchId: br_main.id,
    }});
    const acc_5100 = await prisma.account.create({ data: {
      name: "المساعدات الخيرية", code: "5100", type: "EXPENSE",
      currencyId: cur_dzd.id, branchId: br_main.id, parentId: acc_5000.id,
    }});
    const acc_5110 = await prisma.account.create({ data: {
      name: "مساعدات طبية", code: "5110", type: "EXPENSE",
      currencyId: cur_dzd.id, branchId: br_main.id, parentId: acc_5100.id,
    }});
    const acc_5120 = await prisma.account.create({ data: {
      name: "مساعدات افطار صائم", code: "5120", type: "EXPENSE",
      currencyId: cur_dzd.id, branchId: br_main.id, parentId: acc_5100.id,
    }});
    const acc_5130 = await prisma.account.create({ data: {
      name: "مساعدات عيدي الفطر والاضحى", code: "5130", type: "EXPENSE",
      currencyId: cur_dzd.id, branchId: br_main.id, parentId: acc_5100.id,
    }});
    const acc_5140 = await prisma.account.create({ data: {
      name: "مساعدات طارئة", code: "5140", type: "EXPENSE",
      currencyId: cur_dzd.id, branchId: br_main.id, parentId: acc_5100.id,
    }});
    const acc_5200 = await prisma.account.create({ data: {
      name: "المصروفات الإدارية", code: "5200", type: "EXPENSE",
      currencyId: cur_dzd.id, branchId: br_main.id, parentId: acc_5000.id,
    }});
    const acc_5210 = await prisma.account.create({ data: {
      name: "مصروفات قرطاسية ومطبوعات", code: "5210", type: "EXPENSE",
      currencyId: cur_dzd.id, branchId: br_main.id, parentId: acc_5200.id,
    }});
    const acc_5220 = await prisma.account.create({ data: {
      name: "مصروفات اتصالات", code: "5220", type: "EXPENSE",
      currencyId: cur_dzd.id, branchId: br_main.id, parentId: acc_5200.id,
    }});
    const acc_5290 = await prisma.account.create({ data: {
      name: "مصروفات متنوعة", code: "5290", type: "EXPENSE",
      currencyId: cur_dzd.id, branchId: br_main.id, parentId: acc_5200.id,
    }});

    // ── Journal Entries ──────────────────────────────────────────────────
    
    const je_1 = await prisma.journalEntry.create({ data: {
      entryNumber: 1, description: "صرف 500 يورو بسعر 240",
      date: new Date("2026-03-01T00:00:00.000Z"), status: "DRAFT", type: "GENERAL",
      branchId: br_main.id, totalAmount: 120000, createdBy: usr_admin.id,
      lines: { create: [
        { accountId: acc_1111.id, currencyId: cur_eur.id,
          debit: 0, credit: 500, exchangeRate: 240,
          baseDebit: 0, baseCredit: 120000 },
        { accountId: acc_1121.id, currencyId: cur_dzd.id,
          debit: 120000, credit: 0, exchangeRate: 1,
          baseDebit: 120000, baseCredit: 0 },
      ]},
    }});
    
    // ── Entities (جهات الاشتراك) ─────────────────────────────────────────
    const ent_a4d356a3 = await prisma.entity.create({ data: {
      name: "ولاية بوجدور", code: null,
      currencyId: cur_dzd.id, branchId: br_main.id,
      annualSubscription: 1200,
      userId: usr_mohfadel.id,
    }});
    const ent_375c4caa = await prisma.entity.create({ data: {
      name: "اسبانيا", code: null,
      currencyId: cur_eur.id, branchId: br_main.id,
      annualSubscription: 15,
      userId: usr_mohsalem.id,
    }});

    // ── Members ──────────────────────────────────────────────────────────
    const mbr_1 = await prisma.member.create({ data: {
      name: "أحمد بن محمد", entityId: ent_a4d356a3.id,
      affiliationYear: 2023, status: "ACTIVE",
    }});
    const mbr_2 = await prisma.member.create({ data: {
      name: "سارة عبد الله", entityId: ent_a4d356a3.id,
      affiliationYear: 2024, status: "INACTIVE",
    }});

    // ── Subscription Collections ─────────────────────────────────────────
    const col_1 = await prisma.subscriptionCollection.create({ data: {
      number: null, date: new Date("2026-03-01T00:00:00.000Z"),
      status: "DRAFT", description: "تحصيل اشتراكات سنوية",
      totalAmount: 600, createdBy: usr_admin.id,
      branchId: br_main.id,
      items: { create: [
        { memberId: mbr_1.id, year: 2023, amount: 150 },
        { memberId: mbr_1.id, year: 2024, amount: 150 },
        { memberId: mbr_2.id, year: 2024, amount: 150 },
        { memberId: mbr_1.id, year: 2025, amount: 150 },
      ]},
    }});

    console.log('✅ Seed restored:');
    console.log('   currencies: 4, users: 3, branches: 1');
    console.log('   accounts: 33, journal entries: 5');
    console.log('   entities: 2, members: 2, collections: 1');

  } catch (e) {
    console.error('Seed failed:', e);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
