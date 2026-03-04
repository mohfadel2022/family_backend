import { PrismaClient } from '@prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import bcrypt from 'bcryptjs';

const adapter = new PrismaBetterSqlite3({ url: 'prisma/dev.db' });
const prisma = new PrismaClient({ adapter });

async function main() {
  const salt = await bcrypt.genSalt(10);
  const adminPassword = await bcrypt.hash('admin123', salt);
  const userPassword = await bcrypt.hash('123456', salt);

  try {
    console.log('🌱 Seeding FULL data with RBAC support...');

    // ── Clear ────────────────────────────────────────────────────────────
    await prisma.$executeRawUnsafe('PRAGMA foreign_keys = OFF;');
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
    await prisma.importReport.deleteMany();
    await prisma.rolePermission.deleteMany();
    await prisma.permission.deleteMany();
    await prisma.user.deleteMany();
    await prisma.role.deleteMany();
    await prisma.$executeRawUnsafe('PRAGMA foreign_keys = ON;');

    // ── RBAC: Permissions ────────────────────────────────────────────────
    console.log(' - Setting up granular permissions...');
    const perms = [
      // Vouchers
      { code: 'VOUCHERS_VIEW', name: 'مشاهدة السندات', category: 'المحاسبة', description: 'عرض قائمة السندات والقيود' },
      { code: 'VOUCHERS_CREATE', name: 'إضافة سند', category: 'المحاسبة', description: 'إنشاء سندات قبض وصرف جديدة' },
      { code: 'VOUCHERS_EDIT', name: 'تعديل سند', category: 'المحاسبة', description: 'تعديل بيانات السندات الحالية' },
      { code: 'VOUCHERS_DELETE', name: 'حذف سند', category: 'المحاسبة', description: 'حذف القيود والسندات من النظام' },
      { code: 'VOUCHERS_EXPORT', name: 'تصدير السندات', category: 'المحاسبة', description: 'تصدير السندات إلى PDF/Excel' },
      { code: 'VOUCHERS_IMPORT', name: 'استيراد السندات', category: 'المحاسبة', description: 'استيراد سندات من ملفات خارجية' },

      // Accounts
      { code: 'ACCOUNTS_VIEW', name: 'مشاهدة الحسابات', category: 'المالية', description: 'عرض شجرة الحسابات والأرصدة' },
      { code: 'ACCOUNTS_CREATE', name: 'إضافة حساب', category: 'المالية', description: 'إضافة حسابات جديدة للشجرة' },
      { code: 'ACCOUNTS_EDIT', name: 'تعديل حساب', category: 'المالية', description: 'تعديل أسماء أو أنواع الحسابات' },
      { code: 'ACCOUNTS_DELETE', name: 'حذف حساب', category: 'المالية', description: 'حذف الحسابات غير المستخدمة' },
      { code: 'ACCOUNTS_EXPORT', name: 'تصدير الحسابات', category: 'المالية', description: 'تصدير شجرة الحسابات' },
      { code: 'ACCOUNTS_IMPORT', name: 'استيراد الحسابات', category: 'المالية', description: 'استيراد شجرة حسابات' },

      // Members
      { code: 'MEMBERS_VIEW', name: 'مشاهدة الأعضاء', category: 'الاشتراكات', description: 'عرض قائمة أعضاء الصندوق' },
      { code: 'MEMBERS_CREATE', name: 'إضافة عضو', category: 'الاشتراكات', description: 'تسجيل أعضاء جدد' },
      { code: 'MEMBERS_EDIT', name: 'تعديل عضو', category: 'الاشتراكات', description: 'تحديث بيانات المشتركين' },
      { code: 'MEMBERS_DELETE', name: 'حذف عضو', category: 'الاشتراكات', description: 'حذف سجلات الأعضاء' },
      { code: 'MEMBERS_EXPORT', name: 'تصدير الأعضاء', category: 'الاشتراكات', description: 'تصدير قائمة الأعضاء (Excel/PDF)' },
      { code: 'MEMBERS_IMPORT', name: 'استيراد الأعضاء', category: 'الاشتراكات', description: 'استيراد قائمة أعضاء من ملف Excel' },

      // Entities
      { code: 'ENTITIES_VIEW', name: 'مشاهدة الجهات', category: 'الاشتراكات', description: 'عرض جهات الاشتراك (الولايات)' },
      { code: 'ENTITIES_CREATE', name: 'إضافة جهة', category: 'الاشتراكات', description: 'إضافة جهة اشتراك جديدة' },
      { code: 'ENTITIES_EDIT', name: 'تعديل جهة', category: 'الاشتراكات', description: 'تعديل بيانات الجهات والمشرفين' },
      { code: 'ENTITIES_DELETE', name: 'حذف جهة', category: 'الاشتراكات', description: 'حذف جهة اشتراك' },

      // Users
      { code: 'USERS_VIEW', name: 'مشاهدة المستخدمين', category: 'النظام', description: 'عرض قائمة مستخدمي النظام' },
      { code: 'USERS_CREATE', name: 'إضافة مستخدم', category: 'النظام', description: 'إنشاء حسابات مستخدمين جديدة' },
      { code: 'USERS_EDIT', name: 'تعديل مستخدم', category: 'النظام', description: 'تعديل بيانات وصلاحيات المستخدمين' },
      { code: 'USERS_DELETE', name: 'حذف مستخدم', category: 'النظام', description: 'حذف حساب مستخدم' },

      // Roles
      { code: 'ROLES_VIEW', name: 'مشاهدة الأدوار', category: 'النظام', description: 'عرض مصفوفة الأدوار والصلاحيات' },
      { code: 'ROLES_MANAGE', name: 'إدارة الأدوار', category: 'النظام', description: 'إنشاء وتعديل مصفوفة الصلاحيات' },

      // Reports
      { code: 'REPORTS_VIEW', name: 'مشاهدة التقارير', category: 'التقارير', description: 'الوصول لمركز التقارير المالية' },
      { code: 'REPORTS_EXPORT', name: 'تصدير التقارير', category: 'التقارير', description: 'تصدير القوائم المالية' },

      // Currencies
      { code: 'CURRENCIES_VIEW', name: 'مشاهدة العملات', category: 'المالية', description: 'عرض قائمة العملات وأسعار الصرف' },
      { code: 'CURRENCIES_MANAGE', name: 'إدارة العملات', category: 'المالية', description: 'إضافة وتعديل وحذف العملات' },

      // Periods
      { code: 'PERIODS_VIEW', name: 'مشاهدة الفترات', category: 'المالية', description: 'عرض الفترات المحاسبية وحالة الإغلاق' },
      { code: 'PERIODS_MANAGE', name: 'إدارة الفترات', category: 'المالية', description: 'فتح وإغلاق الفترات المحاسبية' },

      // Security
      { code: 'AUDIT_VIEW', name: 'مشاهدة السجل', category: 'الأمان', description: 'مشاهدة تحركات المستخدمين' },
      { code: 'DB_BACKUP', name: 'النسخ الاحتياطي', category: 'الأمان', description: 'تحميل نسخ احتياطية واستعادتها' },
      { code: 'DB_RESET', name: 'تصفير البيانات', category: 'الأمان', description: 'حذف كافة البيانات المالية (بدء من الصفر)' },
    ];

    const permissionRecords: any = {};
    for (const p of perms) {
      permissionRecords[p.code] = await prisma.permission.create({ data: p });
    }

    // ── RBAC: Roles ──────────────────────────────────────────────────────
    const roleAdmin = await prisma.role.create({
      data: {
        name: 'ADMIN',
        description: 'مدير نظام بصلاحيات كاملة',
        permissions: {
          create: Object.values(permissionRecords).map((p: any) => ({
            permissionId: p.id
          }))
        }
      }
    });

    const roleResponsible = await prisma.role.create({
      data: {
        name: 'RESPONSIBLE',
        description: 'مسؤول العمليات اليومية والتقارير المالية',
        permissions: {
          create: [
            { permissionId: permissionRecords['VOUCHERS_VIEW'].id },
            { permissionId: permissionRecords['VOUCHERS_CREATE'].id },
            { permissionId: permissionRecords['VOUCHERS_EDIT'].id },
            { permissionId: permissionRecords['ACCOUNTS_VIEW'].id },
            { permissionId: permissionRecords['MEMBERS_VIEW'].id },
            { permissionId: permissionRecords['MEMBERS_EDIT'].id },
            { permissionId: permissionRecords['ENTITIES_VIEW'].id },
            { permissionId: permissionRecords['REPORTS_VIEW'].id },
            { permissionId: permissionRecords['REPORTS_EXPORT'].id },
          ]
        }
      }
    });

    const roleEncargado = await prisma.role.create({
      data: {
        name: 'ENCARGADO',
        description: 'مسؤول عن جهة محددة وأعضائها فقط (صلاحيات كاملة ضمن النطاق)',
        permissions: {
          create: [
            // Members (All)
            { permissionId: permissionRecords['MEMBERS_VIEW'].id },
            { permissionId: permissionRecords['MEMBERS_CREATE'].id },
            { permissionId: permissionRecords['MEMBERS_EDIT'].id },
            { permissionId: permissionRecords['MEMBERS_DELETE'].id },
            { permissionId: permissionRecords['MEMBERS_IMPORT'].id },
            { permissionId: permissionRecords['MEMBERS_EXPORT'].id },
            // Entities (View/Edit)
            { permissionId: permissionRecords['ENTITIES_VIEW'].id },
            { permissionId: permissionRecords['ENTITIES_EDIT'].id },
            // Vouchers (View/Create - if they manage subscriptions)
            { permissionId: permissionRecords['VOUCHERS_VIEW'].id },
            { permissionId: permissionRecords['VOUCHERS_CREATE'].id },
            // Reports (View/Export for their entity)
            { permissionId: permissionRecords['REPORTS_VIEW'].id },
            { permissionId: permissionRecords['REPORTS_EXPORT'].id },
            { permissionId: permissionRecords['CURRENCIES_VIEW'].id },
            { permissionId: permissionRecords['PERIODS_VIEW'].id },
          ]
        }
      }
    });

    // ── Currencies ───────────────────────────────────────────────────────
    console.log(' - Creating currencies...');
    const cur_dzd = await prisma.currency.create({
      data: {
        name: "دينار جزائري", code: "DZD", symbol: "د.ج",
        isBase: true, exchangeRate: 1,
      }
    });
    const cur_eur = await prisma.currency.create({
      data: {
        name: "يورو", code: "EUR", symbol: "€",
        isBase: false, exchangeRate: 250,
      }
    });
    const cur_mad = await prisma.currency.create({
      data: {
        name: "درهم مغربي", code: "MAD", symbol: "د.م",
        isBase: false, exchangeRate: 13,
      }
    });
    const cur_mru = await prisma.currency.create({
      data: {
        name: "أوقية موريتانية", code: "MRU", symbol: "UM",
        isBase: false, exchangeRate: 3.5,
      }
    });

    // ── Currency Rate History ────────────────────────────────────────────
    await prisma.currencyRateHistory.create({
      data: {
        currencyId: cur_eur.id, rate: 240, date: new Date("2026-02-28T00:00:00.000Z"),
      }
    });
    await prisma.currencyRateHistory.create({
      data: {
        currencyId: cur_dzd.id, rate: 1, date: new Date("2026-03-01T01:05:26.111Z"),
      }
    });
    await prisma.currencyRateHistory.create({
      data: {
        currencyId: cur_mru.id, rate: 3.5, date: new Date("2026-03-01T01:05:26.205Z"),
      }
    });
    await prisma.currencyRateHistory.create({
      data: {
        currencyId: cur_mad.id, rate: 13, date: new Date("2026-03-01T01:05:26.220Z"),
      }
    });
    await prisma.currencyRateHistory.create({
      data: {
        currencyId: cur_eur.id, rate: 250, date: new Date("2026-03-01T15:16:46.919Z"),
      }
    });

    // ── Users ────────────────────────────────────────────────────────────
    console.log(' - Creating users...');
    const usr_admin = await prisma.user.create({
      data: {
        username: "admin", name: "مدير النظام",
        password: adminPassword,
        roleId: roleAdmin.id,
      }
    });
    const usr_mohfadel = await prisma.user.create({
      data: {
        username: "mohfadel", name: "محمد فاضل",
        password: userPassword,
        roleId: roleEncargado.id,
      }
    });
    const usr_mohsalem = await prisma.user.create({
      data: {
        username: "mohsalem", name: "محمد سالم",
        password: userPassword,
        roleId: roleEncargado.id,
      }
    });

    // ── Branches ─────────────────────────────────────────────────────────
    const br_main = await prisma.branch.create({
      data: {
        name: "المركز الرئيسي", code: "MAIN", currencyId: cur_dzd.id,
        users: { connect: [{ id: usr_admin.id }] }
      }
    });

    // ── Chart of Accounts ────────────────────────────────────────────────
    console.log(' - Creating chart of accounts (33 accounts)...');
    const acc_1000 = await prisma.account.create({
      data: {
        name: "الأصول", code: "1000", type: "ASSET",
        currencyId: cur_dzd.id, branchId: br_main.id,
      }
    });
    const acc_1100 = await prisma.account.create({
      data: {
        name: "الصناديق النقدية", code: "1100", type: "ASSET",
        currencyId: cur_dzd.id, branchId: br_main.id, parentId: acc_1000.id,
      }
    });
    const acc_1110 = await prisma.account.create({
      data: {
        name: "صندوق اليورو", code: "1110", type: "ASSET",
        currencyId: cur_eur.id, branchId: br_main.id, parentId: acc_1100.id,
      }
    });
    const acc_1111 = await prisma.account.create({
      data: {
        name: "صندوق اليورو - نقدي", code: "1111", type: "ASSET",
        currencyId: cur_eur.id, branchId: br_main.id, parentId: acc_1110.id,
      }
    });
    const acc_1120 = await prisma.account.create({
      data: {
        name: "صندوق الدينار الجزائري", code: "1120", type: "ASSET",
        currencyId: cur_dzd.id, branchId: br_main.id, parentId: acc_1100.id,
      }
    });
    const acc_1121 = await prisma.account.create({
      data: {
        name: "صندوق الدينار - نقدي", code: "1121", type: "ASSET",
        currencyId: cur_dzd.id, branchId: br_main.id, parentId: acc_1120.id,
      }
    });
    const acc_1200 = await prisma.account.create({
      data: {
        name: "مستحقات على الأعضاء", code: "1200", type: "ASSET",
        currencyId: cur_dzd.id, branchId: br_main.id, parentId: acc_1000.id,
      }
    });
    const acc_2000 = await prisma.account.create({
      data: {
        name: "الالتزامات", code: "2000", type: "LIABILITY",
        currencyId: cur_dzd.id, branchId: br_main.id,
      }
    });
    const acc_2100 = await prisma.account.create({
      data: {
        name: "مساعدات مستحقة للمستفيدين", code: "2100", type: "LIABILITY",
        currencyId: cur_dzd.id, branchId: br_main.id, parentId: acc_2000.id,
      }
    });
    const acc_2200 = await prisma.account.create({
      data: {
        name: "مصروفات مستحقة", code: "2200", type: "LIABILITY",
        currencyId: cur_dzd.id, branchId: br_main.id, parentId: acc_2000.id,
      }
    });
    const acc_4000 = await prisma.account.create({
      data: {
        name: "الإيرادات", code: "4000", type: "REVENUE",
        currencyId: cur_dzd.id, branchId: br_main.id,
      }
    });
    const acc_4100 = await prisma.account.create({
      data: {
        name: "التبرعات النقدية", code: "4100", type: "REVENUE",
        currencyId: cur_dzd.id, branchId: br_main.id, parentId: acc_4000.id,
      }
    });
    const acc_4110 = await prisma.account.create({
      data: {
        name: "تبرعات باليورو", code: "4110", type: "REVENUE",
        currencyId: cur_eur.id, branchId: br_main.id, parentId: acc_4100.id,
      }
    });
    const acc_4120 = await prisma.account.create({
      data: {
        name: "تبرعات بالدينار الجزائري", code: "4120", type: "REVENUE",
        currencyId: cur_dzd.id, branchId: br_main.id, parentId: acc_4100.id,
      }
    });
    const acc_4200 = await prisma.account.create({
      data: {
        name: "مساهمات الأعضاء الشهرية", code: "4200", type: "REVENUE",
        currencyId: cur_dzd.id, branchId: br_main.id, parentId: acc_4000.id,
      }
    });
    const acc_4210 = await prisma.account.create({
      data: {
        name: "مساهمات باليورو", code: "4210", type: "REVENUE",
        currencyId: cur_eur.id, branchId: br_main.id, parentId: acc_4200.id,
      }
    });
    const acc_4220 = await prisma.account.create({
      data: {
        name: "مساهمات بالدينار الجزائري", code: "4220", type: "REVENUE",
        currencyId: cur_dzd.id, branchId: br_main.id, parentId: acc_4200.id,
      }
    });
    const acc_4300 = await prisma.account.create({
      data: {
        name: "إيرادات استثمارية", code: "4300", type: "REVENUE",
        currencyId: cur_dzd.id, branchId: br_main.id, parentId: acc_4000.id,
      }
    });
    const acc_4310 = await prisma.account.create({
      data: {
        name: "إيرادات استثمارية باليورو", code: "4310", type: "REVENUE",
        currencyId: cur_eur.id, branchId: br_main.id, parentId: acc_4300.id,
      }
    });
    const acc_4320 = await prisma.account.create({
      data: {
        name: "إيرادات استثمارية بالدينار", code: "4320", type: "REVENUE",
        currencyId: cur_dzd.id, branchId: br_main.id, parentId: acc_4300.id,
      }
    });
    const acc_4900 = await prisma.account.create({
      data: {
        name: "إيرادات متنوعة", code: "4900", type: "REVENUE",
        currencyId: cur_dzd.id, branchId: br_main.id, parentId: acc_4000.id,
      }
    });
    const acc_4910 = await prisma.account.create({
      data: {
        name: "إيرادات متنوعة باليورو", code: "4910", type: "REVENUE",
        currencyId: cur_eur.id, branchId: br_main.id, parentId: acc_4900.id,
      }
    });
    const acc_4920 = await prisma.account.create({
      data: {
        name: "إيرادات متنوعة بالدينار", code: "4920", type: "REVENUE",
        currencyId: cur_dzd.id, branchId: br_main.id, parentId: acc_4900.id,
      }
    });
    const acc_5000 = await prisma.account.create({
      data: {
        name: "المصروفات", code: "5000", type: "EXPENSE",
        currencyId: cur_dzd.id, branchId: br_main.id,
      }
    });
    const acc_5100 = await prisma.account.create({
      data: {
        name: "المساعدات الخيرية", code: "5100", type: "EXPENSE",
        currencyId: cur_dzd.id, branchId: br_main.id, parentId: acc_5000.id,
      }
    });
    const acc_5110 = await prisma.account.create({
      data: {
        name: "مساعدات طبية", code: "5110", type: "EXPENSE",
        currencyId: cur_dzd.id, branchId: br_main.id, parentId: acc_5100.id,
      }
    });
    const acc_5120 = await prisma.account.create({
      data: {
        name: "مساعدات افطار صائم", code: "5120", type: "EXPENSE",
        currencyId: cur_dzd.id, branchId: br_main.id, parentId: acc_5100.id,
      }
    });
    const acc_5130 = await prisma.account.create({
      data: {
        name: "مساعدات عيدي الفطر والاضحى", code: "5130", type: "EXPENSE",
        currencyId: cur_dzd.id, branchId: br_main.id, parentId: acc_5100.id,
      }
    });
    const acc_5140 = await prisma.account.create({
      data: {
        name: "مساعدات طارئة", code: "5140", type: "EXPENSE",
        currencyId: cur_dzd.id, branchId: br_main.id, parentId: acc_5100.id,
      }
    });
    const acc_5200 = await prisma.account.create({
      data: {
        name: "المصروفات الإدارية", code: "5200", type: "EXPENSE",
        currencyId: cur_dzd.id, branchId: br_main.id, parentId: acc_5000.id,
      }
    });
    const acc_5210 = await prisma.account.create({
      data: {
        name: "مصروفات قرطاسية ومطبوعات", code: "5210", type: "EXPENSE",
        currencyId: cur_dzd.id, branchId: br_main.id, parentId: acc_5200.id,
      }
    });
    const acc_5220 = await prisma.account.create({
      data: {
        name: "مصروفات اتصالات", code: "5220", type: "EXPENSE",
        currencyId: cur_dzd.id, branchId: br_main.id, parentId: acc_5200.id,
      }
    });
    const acc_5290 = await prisma.account.create({
      data: {
        name: "مصروفات متنوعة", code: "5290", type: "EXPENSE",
        currencyId: cur_dzd.id, branchId: br_main.id, parentId: acc_5200.id,
      }
    });

    // ── Journal Entries ──────────────────────────────────────────────────
    console.log(' - Creating journal entries...');
    const je_1 = await prisma.journalEntry.create({
      data: {
        entryNumber: 1, description: "صرف 500 يورو بسعر 240",
        date: new Date("2026-03-01T00:00:00.000Z"), status: "DRAFT", type: "GENERAL",
        branchId: br_main.id, totalAmount: 120000, createdBy: usr_admin.id,
        lines: {
          create: [
            {
              accountId: acc_1111.id, currencyId: cur_eur.id,
              debit: 0, credit: 500, exchangeRate: 240,
              baseDebit: 0, baseCredit: 120000
            },
            {
              accountId: acc_1121.id, currencyId: cur_dzd.id,
              debit: 120000, credit: 0, exchangeRate: 1,
              baseDebit: 120000, baseCredit: 0
            },
          ]
        },
      }
    });

    // ── Entities (جهات الاشتراك) ─────────────────────────────────────────
    const ent_boj = await prisma.entity.create({
      data: {
        name: "ولاية بوجدور", code: "BOJ",
        currencyId: cur_dzd.id, branchId: br_main.id,
        annualSubscription: 1200,
        userId: usr_mohfadel.id,
      }
    });
    const ent_esp = await prisma.entity.create({
      data: {
        name: "اسبانيا", code: "ESP",
        currencyId: cur_eur.id, branchId: br_main.id,
        annualSubscription: 15,
        userId: usr_mohsalem.id,
      }
    });

    // ── Members ──────────────────────────────────────────────────────────
    const mbr_1 = await prisma.member.create({
      data: {
        name: "أحمد بن محمد", entityId: ent_boj.id,
        affiliationYear: 2023, status: "ACTIVE",
      }
    });
    const mbr_2 = await prisma.member.create({
      data: {
        name: "سارة عبد الله", entityId: ent_boj.id,
        affiliationYear: 2024, status: "INACTIVE",
      }
    });

    // ── Subscription Collections ─────────────────────────────────────────
    const col_1 = await prisma.subscriptionCollection.create({
      data: {
        number: 1, date: new Date("2026-03-01T00:00:00.000Z"),
        status: "DRAFT", description: "تحصيل اشتراكات سنوية",
        totalAmount: 600, createdBy: usr_admin.id,
        branchId: br_main.id,
        items: {
          create: [
            { memberId: mbr_1.id, year: 2023, amount: 150 },
            { memberId: mbr_1.id, year: 2024, amount: 150 },
            { memberId: mbr_2.id, year: 2024, amount: 150 },
            { memberId: mbr_1.id, year: 2025, amount: 150 },
          ]
        },
      }
    });

    console.log('✅ FULL Seed completed successfully.');
    console.log(' - RBAC: Roles & Permissions defined');
    console.log(` - Data: 4 Currencies, 3 Users, 1 Branch, 33 Accounts, 1 Entry, 2 Entities, 2 Members, 1 Collection`);

  } catch (err) {
    console.error('❌ Seed error:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
