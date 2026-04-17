"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const prisma_1 = __importDefault(require("../src/infrastructure/database/prisma"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
async function main() {
    const salt = await bcryptjs_1.default.genSalt(10);
    const adminPassword = await bcryptjs_1.default.hash('admin123', salt);
    const userPassword = await bcryptjs_1.default.hash('123456', salt);
    try {
        console.log('🌱 Seeding FULL data with RBAC support...');
        // ── Clear ────────────────────────────────────────────────────────────
        // PRAGMA foreign_keys = OFF is not supported by LibSQL adapter in $executeRawUnsafe
        await prisma_1.default.subscriptionCollectionItem.deleteMany();
        await prisma_1.default.subscriptionCollection.deleteMany();
        await prisma_1.default.memberSubscription.deleteMany();
        await prisma_1.default.member.deleteMany();
        await prisma_1.default.entity.deleteMany();
        await prisma_1.default.currencyRateHistory.deleteMany();
        await prisma_1.default.journalLine.deleteMany();
        await prisma_1.default.journalEntry.deleteMany();
        await prisma_1.default.auditLog.deleteMany();
        await prisma_1.default.account.deleteMany();
        await prisma_1.default.branch.deleteMany();
        await prisma_1.default.period.deleteMany();
        await prisma_1.default.currency.deleteMany();
        await prisma_1.default.importReport.deleteMany();
        await prisma_1.default.rolePermission.deleteMany();
        await prisma_1.default.permission.deleteMany();
        await prisma_1.default.user.deleteMany();
        await prisma_1.default.role.deleteMany();
        // PRAGMA foreign_keys = ON is not supported by LibSQL adapter in $executeRawUnsafe
        // ── RBAC: Permissions ────────────────────────────────────────────────
        console.log(' - Setting up granular permissions...');
        const perms = [
            // Vouchers - Journal
            { code: 'JOURNAL_VIEW', name: 'مشاهدة', category: 'السندات / قيود اليومية', description: 'عرض قيود اليومية' },
            { code: 'JOURNAL_CREATE', name: 'إضافة', category: 'السندات / قيود اليومية', description: 'إنشاء قيود يومية جديدة' },
            { code: 'JOURNAL_EDIT', name: 'تعديل', category: 'السندات / قيود اليومية', description: 'تعديل قيود اليومية' },
            { code: 'JOURNAL_DELETE', name: 'حذف', category: 'السندات / قيود اليومية', description: 'حذف قيود اليومية' },
            { code: 'JOURNAL_PRINT', name: 'طباعة', category: 'السندات / قيود اليومية', description: 'طباعة القيد' },
            { code: 'JOURNAL_POST', name: 'ترحيل', category: 'السندات / قيود اليومية', description: 'ترحيل القيد' },
            { code: 'JOURNAL_UNPOST', name: 'إلغاء ترحيل', category: 'السندات / قيود اليومية', description: 'إلغاء ترحيل القيد' },
            // Vouchers - Receipts
            { code: 'RECEIPT_VIEW', name: 'مشاهدة', category: 'السندات / سندات القبض', description: 'عرض سندات القبض' },
            { code: 'RECEIPT_CREATE', name: 'إضافة', category: 'السندات / سندات القبض', description: 'إنشاء سندات قبض جديدة' },
            { code: 'RECEIPT_EDIT', name: 'تعديل', category: 'السندات / سندات القبض', description: 'تعديل سندات القبض' },
            { code: 'RECEIPT_DELETE', name: 'حذف', category: 'السندات / سندات القبض', description: 'حذف سندات القبض' },
            { code: 'RECEIPT_PRINT', name: 'طباعة', category: 'السندات / سندات القبض', description: 'طباعة سند القبض' },
            { code: 'RECEIPT_POST', name: 'ترحيل', category: 'السندات / سندات القبض', description: 'ترحيل سند القبض' },
            { code: 'RECEIPT_UNPOST', name: 'إلغاء ترحيل', category: 'السندات / سندات القبض', description: 'إلغاء ترحيل سند القبض' },
            // Vouchers - Payments
            { code: 'PAYMENT_VIEW', name: 'مشاهدة', category: 'السندات / سندات الصرف', description: 'عرض سندات الصرف' },
            { code: 'PAYMENT_CREATE', name: 'إضافة', category: 'السندات / سندات الصرف', description: 'إنشاء سندات صرف جديدة' },
            { code: 'PAYMENT_EDIT', name: 'تعديل', category: 'السندات / سندات الصرف', description: 'تعديل سندات صرف' },
            { code: 'PAYMENT_DELETE', name: 'حذف', category: 'السندات / سندات الصرف', description: 'حذف سندات صرف' },
            { code: 'PAYMENT_PRINT', name: 'طباعة', category: 'السندات / سندات الصرف', description: 'طباعة سند الصرف' },
            { code: 'PAYMENT_POST', name: 'ترحيل', category: 'السندات / سندات الصرف', description: 'ترحيل سند الصرف' },
            { code: 'PAYMENT_UNPOST', name: 'إلغاء ترحيل', category: 'السندات / سندات الصرف', description: 'إلغاء ترحيل سند الصرف' },
            // Subscriptions
            { code: 'SUBSCRIPTIONS_VIEW', name: 'مشاهدة', category: 'الاشتراكات', description: 'عرض ملخص الاشتراكات' },
            { code: 'MEMBERS_VIEW', name: 'مشاهدة', category: 'الاشتراكات / الأعضاء', description: 'عرض قائمة الأعضاء' },
            { code: 'MEMBERS_CREATE', name: 'إضافة', category: 'الاشتراكات / الأعضاء', description: 'تسجيل أعضاء جدد' },
            { code: 'MEMBERS_EDIT', name: 'تعديل', category: 'الاشتراكات / الأعضاء', description: 'تحديث بيانات المشتركين' },
            { code: 'MEMBERS_DELETE', name: 'حذف', category: 'الاشتراكات / الأعضاء', description: 'حذف سجلات الأعضاء' },
            { code: 'MEMBERS_IMPORT', name: 'استيراد', category: 'الاشتراكات / الأعضاء', description: 'استيراد قائمة أعضاء' },
            { code: 'MEMBERS_EXPORT', name: 'تصدير', category: 'الاشتراكات / الأعضاء', description: 'تصدير قائمة الأعضاء' },
            { code: 'ENTITIES_VIEW', name: 'مشاهدة', category: 'الإعدادات / إدارة الجهات', description: 'عرض جهات الاشتراك' },
            { code: 'ENTITIES_CREATE', name: 'إضافة', category: 'الإعدادات / إدارة الجهات', description: 'إضافة جهة اشتراك جديدة' },
            { code: 'ENTITIES_EDIT', name: 'تعديل', category: 'الإعدادات / إدارة الجهات', description: 'تعديل بيانات الجهات' },
            { code: 'ENTITIES_DELETE', name: 'حذف', category: 'الإعدادات / إدارة الجهات', description: 'حذف جهة اشتراك' },
            { code: 'COLLECTS_VIEW', name: 'مشاهدة', category: 'الاشتراكات / التحصيل', description: 'عرض عمليات التحصيل' },
            { code: 'COLLECTS_CREATE', name: 'إنشاء', category: 'الاشتراكات / التحصيل', description: 'تسجيل عمليات تحصيل جديدة' },
            { code: 'COLLECTS_EDIT', name: 'تعديل (Unpost)', category: 'الاشتراكات / التحصيل', description: 'تعديل عمليات التحصيل' },
            { code: 'COLLECTS_DELETE', name: 'حذف', category: 'الاشتراكات / التحصيل', description: 'حذف عمليات التحصيل' },
            // Reports
            { code: 'REPORTS_VIEW', name: 'دخول المركز', category: 'التقارير', description: 'الوصول لمركز التقارير' },
            { code: 'REPORTS_EXPORT', name: 'تصدير', category: 'التقارير', description: 'تصدير التقارير' },
            { code: 'REPORTS_TRIAL_BALANCE_VIEW', name: 'مشاهدة', category: 'التقارير / ميزان المراجعة', description: 'عرض ميزان المراجعة' },
            { code: 'REPORTS_TRIAL_BALANCE_EXPORT', name: 'تصدير', category: 'التقارير / ميزان المراجعة', description: 'تصدير ميزان المراجعة' },
            { code: 'REPORTS_INCOME_STATEMENT_VIEW', name: 'مشاهدة', category: 'التقارير / قائمة الدخل', description: 'عرض قائمة الدخل' },
            { code: 'REPORTS_INCOME_STATEMENT_EXPORT', name: 'تصدير', category: 'التقارير / قائمة الدخل', description: 'تصدير قائمة الدخل' },
            { code: 'REPORTS_ACCOUNT_STATEMENT_VIEW', name: 'مشاهدة', category: 'التقارير / كشف الحساب', description: 'عرض كشف حساب تفصيلي' },
            { code: 'REPORTS_ACCOUNT_STATEMENT_EXPORT', name: 'تصدير', category: 'التقارير / كشف الحساب', description: 'تصدير كشف الحساب' },
            { code: 'REPORTS_BRANCH_REVENUE_VIEW', name: 'مشاهدة', category: 'التقارير / إيرادات الجهات', description: 'عرض تقرير إيرادات الجهات' },
            { code: 'REPORTS_BRANCH_REVENUE_EXPORT', name: 'تصدير', category: 'التقارير / إيرادات الجهات', description: 'تصدير تقرير إيرادات الجهات' },
            { code: 'REPORTS_BRANCH_EXPENSE_VIEW', name: 'مشاهدة', category: 'التقارير / مصاريف الجهات', description: 'عرض تقرير مصاريف الجهات' },
            { code: 'REPORTS_BRANCH_EXPENSE_EXPORT', name: 'تصدير', category: 'التقارير / مصاريف الجهات', description: 'تصدير تقرير مصاريف الجهات' },
            { code: 'REPORTS_CURRENCY_GAINS_VIEW', name: 'مشاهدة', category: 'التقارير / فروقات العملة', description: 'عرض تقرير فروقات الصرف' },
            { code: 'REPORTS_CURRENCY_GAINS_EXPORT', name: 'تصدير', category: 'التقارير / فروقات العملة', description: 'تصدير تقرير فروقات الصرف' },
            { code: 'REPORTS_CURRENCY_HISTORY_VIEW', name: 'مشاهدة', category: 'التقارير / سجل العملات', description: 'عرض سجل تاريخ أسعار الصرف' },
            { code: 'REPORTS_CURRENCY_HISTORY_EXPORT', name: 'تصدير', category: 'التقارير / سجل العملات', description: 'تصدير سجل أسعار الصرف' },
            { code: 'REPORTS_SUBSCRIPTIONS_VIEW', name: 'مشاهدة', category: 'التقارير / جدول الاشتراكات', description: 'عرض تقرير الاشتراكات' },
            { code: 'REPORTS_SUBSCRIPTIONS_EXPORT', name: 'تصدير', category: 'التقارير / جدول الاشتراكات', description: 'تصدير تقرير الاشتراكات PDF/Excel' },
            // Accounts
            { code: 'ACCOUNTS_VIEW', name: 'مشاهدة', category: 'الحسابات / شجرة الحسابات', description: 'عرض شجرة الحسابات' },
            { code: 'ACCOUNTS_CREATE', name: 'إضافة', category: 'الحسابات / شجرة الحسابات', description: 'إضافة حسابات جديدة' },
            { code: 'ACCOUNTS_EDIT', name: 'تعديل', category: 'الحسابات / شجرة الحسابات', description: 'تعديل الحسابات' },
            { code: 'ACCOUNTS_DELETE', name: 'حذف', category: 'الحسابات / شجرة الحسابات', description: 'حذف الحسابات' },
            { code: 'ACCOUNTS_EXPORT', name: 'تصدير', category: 'الحسابات / شجرة الحسابات', description: 'تصدير شجرة الحسابات' },
            { code: 'ACCOUNTS_IMPORT', name: 'استيراد', category: 'الحسابات / شجرة الحسابات', description: 'استيراد شجرة حسابات' },
            { code: 'CURRENCIES_VIEW', name: 'مشاهدة', category: 'الإعدادات / العملات', description: 'عرض العملات' },
            { code: 'CURRENCIES_CREATE', name: 'إضافة', category: 'الإعدادات / العملات', description: 'إضافة عملات جديدة' },
            { code: 'CURRENCIES_EDIT', name: 'تعديل', category: 'الإعدادات / العملات', description: 'تعديل العملات والأسعار' },
            { code: 'CURRENCIES_DELETE', name: 'حذف', category: 'الإعدادات / العملات', description: 'حذف العملات' },
            { code: 'PERIODS_VIEW', name: 'مشاهدة', category: 'الإعدادات / الفترات', description: 'عرض الفترات المحاسبية' },
            { code: 'PERIODS_CREATE', name: 'إضافة', category: 'الإعدادات / الفترات', description: 'إضافة فترات محاسبية' },
            { code: 'PERIODS_EDIT', name: 'تعديل', category: 'الإعدادات / الفترات', description: 'تعديل أو قفل الفترات' },
            { code: 'PERIODS_DELETE', name: 'حذف', category: 'الإعدادات / الفترات', description: 'حذف الفترات' },
            { code: 'USERS_VIEW', name: 'مشاهدة', category: 'الإعدادات / المستخدمين', description: 'عرض قائمة المستخدمين' },
            { code: 'USERS_CREATE', name: 'إضافة', category: 'الإعدادات / المستخدمين', description: 'إنشاء حسابات مستخدمين' },
            { code: 'USERS_EDIT', name: 'تعديل', category: 'الإعدادات / المستخدمين', description: 'تعديل بيانات المستخدمين' },
            { code: 'USERS_DELETE', name: 'حذف', category: 'الإعدادات / المستخدمين', description: 'حذف حساب مستخدم' },
            { code: 'ROLES_VIEW', name: 'مشاهدة', category: 'الإعدادات / الأدوار', description: 'عرض مصفوفة الأدوار' },
            { code: 'ROLES_CREATE', name: 'إضافة', category: 'الإعدادات / الأدوار', description: 'إنشاء أدوار جديدة' },
            { code: 'ROLES_EDIT', name: 'تعديل', category: 'الإعدادات / الأدوار', description: 'تعديل صلاحيات الأدوار' },
            { code: 'ROLES_DELETE', name: 'حذف', category: 'الإعدادات / الأدوار', description: 'حذف الأدوار' },
            { code: 'PERMISSIONS_VIEW', name: 'مشاهدة', category: 'الإعدادات / إدارة الصلاحيات', description: 'عرض مفاتيح الصلاحيات' },
            { code: 'PERMISSIONS_CREATE', name: 'إضافة', category: 'الإعدادات / إدارة الصلاحيات', description: 'إضافة مفاتيح جديدة' },
            { code: 'PERMISSIONS_EDIT', name: 'تعديل', category: 'الإعدادات / إدارة الصلاحيات', description: 'تعديل مفاتيح الصلاحيات' },
            { code: 'PERMISSIONS_DELETE', name: 'حذف', category: 'الإعدادات / إدارة الصلاحيات', description: 'حذف مفاتيح الصلاحيات' },
            { code: 'AUDIT_LOGS_VIEW', name: 'مشاهدة', category: 'الإعدادات / سجل العمليات', description: 'مشاهدة سجل الحركات' },
            { code: 'AUDIT_LOGS_DELETE', name: 'حذف', category: 'الإعدادات / سجل العمليات', description: 'حذف سجلات العمليات' },
            { code: 'DB_BACKUP', name: 'نسخ احتياطي', category: 'الإعدادات / قاعدة البيانات', description: 'النسخ الاحتياطي' },
            { code: 'DB_RESTORE', name: 'استعادة', category: 'الإعدادات / قاعدة البيانات', description: 'استعادة قاعدة البيانات' },
            { code: 'DB_RESET', name: 'تصفير المالي', category: 'الإعدادات / قاعدة البيانات', description: 'تصفير البيانات' },
            { code: 'THEMES_VIEW', name: 'مشاهدة', category: 'الإعدادات / ألوان الصفحات', description: 'عرض إعدادات ألوان الصفحات' },
            { code: 'THEMES_EDIT', name: 'تعديل', category: 'الإعدادات / ألوان الصفحات', description: 'تعديل ألوان الصفحات' },
        ];
        const permissionRecords = {};
        for (const p of perms) {
            permissionRecords[p.code] = await prisma_1.default.permission.create({ data: p });
        }
        // ── RBAC: Roles ──────────────────────────────────────────────────────
        const roleAdmin = await prisma_1.default.role.create({
            data: {
                name: 'ADMIN',
                description: 'مدير نظام بصلاحيات كاملة',
                permissions: {
                    create: Object.values(permissionRecords).map((p) => ({
                        permissionId: p.id
                    }))
                }
            }
        });
        const roleResponsable = await prisma_1.default.role.create({
            data: {
                name: 'RESPONSABLE',
                description: 'مسؤول العمليات اليومية والتقارير المالية',
                permissions: {
                    create: [
                        { permissionId: permissionRecords['JOURNAL_VIEW'].id },
                        { permissionId: permissionRecords['JOURNAL_CREATE'].id },
                        { permissionId: permissionRecords['JOURNAL_EDIT'].id },
                        { permissionId: permissionRecords['JOURNAL_POST'].id },
                        { permissionId: permissionRecords['JOURNAL_UNPOST'].id },
                        { permissionId: permissionRecords['RECEIPT_VIEW'].id },
                        { permissionId: permissionRecords['RECEIPT_CREATE'].id },
                        { permissionId: permissionRecords['RECEIPT_EDIT'].id },
                        { permissionId: permissionRecords['RECEIPT_POST'].id },
                        { permissionId: permissionRecords['RECEIPT_UNPOST'].id },
                        { permissionId: permissionRecords['PAYMENT_VIEW'].id },
                        { permissionId: permissionRecords['PAYMENT_CREATE'].id },
                        { permissionId: permissionRecords['PAYMENT_EDIT'].id },
                        { permissionId: permissionRecords['PAYMENT_POST'].id },
                        { permissionId: permissionRecords['PAYMENT_UNPOST'].id },
                        { permissionId: permissionRecords['JOURNAL_PRINT'].id },
                        { permissionId: permissionRecords['RECEIPT_PRINT'].id },
                        { permissionId: permissionRecords['PAYMENT_PRINT'].id },
                        { permissionId: permissionRecords['ACCOUNTS_VIEW'].id },
                        { permissionId: permissionRecords['MEMBERS_VIEW'].id },
                        { permissionId: permissionRecords['MEMBERS_CREATE'].id },
                        { permissionId: permissionRecords['MEMBERS_EDIT'].id },
                        { permissionId: permissionRecords['MEMBERS_DELETE'].id },
                        { permissionId: permissionRecords['ENTITIES_VIEW'].id },
                        { permissionId: permissionRecords['COLLECTS_VIEW'].id },
                        { permissionId: permissionRecords['COLLECTS_CREATE'].id },
                        { permissionId: permissionRecords['COLLECTS_EDIT'].id },
                        { permissionId: permissionRecords['REPORTS_VIEW'].id },
                        { permissionId: permissionRecords['REPORTS_EXPORT'].id },
                        { permissionId: permissionRecords['REPORTS_TRIAL_BALANCE_VIEW'].id },
                        { permissionId: permissionRecords['REPORTS_TRIAL_BALANCE_EXPORT'].id },
                        { permissionId: permissionRecords['REPORTS_INCOME_STATEMENT_VIEW'].id },
                        { permissionId: permissionRecords['REPORTS_INCOME_STATEMENT_EXPORT'].id },
                        { permissionId: permissionRecords['REPORTS_ACCOUNT_STATEMENT_VIEW'].id },
                        { permissionId: permissionRecords['REPORTS_ACCOUNT_STATEMENT_EXPORT'].id },
                        { permissionId: permissionRecords['REPORTS_BRANCH_REVENUE_VIEW'].id },
                        { permissionId: permissionRecords['REPORTS_BRANCH_REVENUE_EXPORT'].id },
                        { permissionId: permissionRecords['REPORTS_BRANCH_EXPENSE_VIEW'].id },
                        { permissionId: permissionRecords['REPORTS_BRANCH_EXPENSE_EXPORT'].id },
                        { permissionId: permissionRecords['REPORTS_CURRENCY_GAINS_VIEW'].id },
                        { permissionId: permissionRecords['REPORTS_CURRENCY_GAINS_EXPORT'].id },
                        { permissionId: permissionRecords['REPORTS_CURRENCY_HISTORY_VIEW'].id },
                        { permissionId: permissionRecords['REPORTS_CURRENCY_HISTORY_EXPORT'].id },
                        { permissionId: permissionRecords['REPORTS_SUBSCRIPTIONS_VIEW'].id },
                        { permissionId: permissionRecords['REPORTS_SUBSCRIPTIONS_EXPORT'].id },
                        { permissionId: permissionRecords['CURRENCIES_VIEW'].id },
                        { permissionId: permissionRecords['PERIODS_VIEW'].id },
                    ]
                }
            }
        });
        const roleEncargado = await prisma_1.default.role.create({
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
                        // Vouchers (View/Create/Edit/Delete)
                        { permissionId: permissionRecords['JOURNAL_VIEW'].id },
                        { permissionId: permissionRecords['JOURNAL_CREATE'].id },
                        { permissionId: permissionRecords['JOURNAL_EDIT'].id },
                        { permissionId: permissionRecords['JOURNAL_DELETE'].id },
                        { permissionId: permissionRecords['JOURNAL_POST'].id },
                        { permissionId: permissionRecords['JOURNAL_UNPOST'].id },
                        { permissionId: permissionRecords['RECEIPT_VIEW'].id },
                        { permissionId: permissionRecords['RECEIPT_CREATE'].id },
                        { permissionId: permissionRecords['RECEIPT_EDIT'].id },
                        { permissionId: permissionRecords['RECEIPT_DELETE'].id },
                        { permissionId: permissionRecords['RECEIPT_POST'].id },
                        { permissionId: permissionRecords['RECEIPT_UNPOST'].id },
                        { permissionId: permissionRecords['PAYMENT_VIEW'].id },
                        { permissionId: permissionRecords['PAYMENT_CREATE'].id },
                        { permissionId: permissionRecords['PAYMENT_EDIT'].id },
                        { permissionId: permissionRecords['PAYMENT_DELETE'].id },
                        { permissionId: permissionRecords['PAYMENT_POST'].id },
                        { permissionId: permissionRecords['PAYMENT_UNPOST'].id },
                        { permissionId: permissionRecords['JOURNAL_PRINT'].id },
                        { permissionId: permissionRecords['RECEIPT_PRINT'].id },
                        { permissionId: permissionRecords['PAYMENT_PRINT'].id },
                        // Reports (View/Export for their entity)
                        { permissionId: permissionRecords['REPORTS_VIEW'].id },
                        { permissionId: permissionRecords['REPORTS_EXPORT'].id },
                        { permissionId: permissionRecords['REPORTS_TRIAL_BALANCE_VIEW'].id },
                        { permissionId: permissionRecords['REPORTS_TRIAL_BALANCE_EXPORT'].id },
                        { permissionId: permissionRecords['REPORTS_INCOME_STATEMENT_VIEW'].id },
                        { permissionId: permissionRecords['REPORTS_INCOME_STATEMENT_EXPORT'].id },
                        { permissionId: permissionRecords['REPORTS_ACCOUNT_STATEMENT_VIEW'].id },
                        { permissionId: permissionRecords['REPORTS_ACCOUNT_STATEMENT_EXPORT'].id },
                        { permissionId: permissionRecords['REPORTS_BRANCH_REVENUE_VIEW'].id },
                        { permissionId: permissionRecords['REPORTS_BRANCH_REVENUE_EXPORT'].id },
                        { permissionId: permissionRecords['REPORTS_BRANCH_EXPENSE_VIEW'].id },
                        { permissionId: permissionRecords['REPORTS_BRANCH_EXPENSE_EXPORT'].id },
                        { permissionId: permissionRecords['REPORTS_CURRENCY_GAINS_VIEW'].id },
                        { permissionId: permissionRecords['REPORTS_CURRENCY_GAINS_EXPORT'].id },
                        { permissionId: permissionRecords['REPORTS_CURRENCY_HISTORY_VIEW'].id },
                        { permissionId: permissionRecords['REPORTS_CURRENCY_HISTORY_EXPORT'].id },
                        { permissionId: permissionRecords['REPORTS_SUBSCRIPTIONS_VIEW'].id },
                        { permissionId: permissionRecords['REPORTS_SUBSCRIPTIONS_EXPORT'].id },
                        { permissionId: permissionRecords['ACCOUNTS_VIEW'].id },
                        { permissionId: permissionRecords['CURRENCIES_VIEW'].id },
                        { permissionId: permissionRecords['PERIODS_VIEW'].id },
                    ]
                }
            }
        });
        // ── Currencies ───────────────────────────────────────────────────────
        console.log(' - Creating currencies...');
        const cur_dzd = await prisma_1.default.currency.create({
            data: {
                name: "دينار جزائري", code: "DZD", symbol: "د.ج",
                isBase: true, exchangeRate: 1,
            }
        });
        const cur_eur = await prisma_1.default.currency.create({
            data: {
                name: "يورو", code: "EUR", symbol: "€",
                isBase: false, exchangeRate: 250,
            }
        });
        const cur_mad = await prisma_1.default.currency.create({
            data: {
                name: "درهم مغربي", code: "MAD", symbol: "د.م",
                isBase: false, exchangeRate: 13,
            }
        });
        const cur_mru = await prisma_1.default.currency.create({
            data: {
                name: "أوقية موريتانية", code: "MRU", symbol: "UM",
                isBase: false, exchangeRate: 3.5,
            }
        });
        // ── Currency Rate History ────────────────────────────────────────────
        await prisma_1.default.currencyRateHistory.create({
            data: {
                currencyId: cur_eur.id, rate: 240, date: new Date("2026-02-28T00:00:00.000Z"),
            }
        });
        await prisma_1.default.currencyRateHistory.create({
            data: {
                currencyId: cur_dzd.id, rate: 1, date: new Date("2026-03-01T01:05:26.111Z"),
            }
        });
        await prisma_1.default.currencyRateHistory.create({
            data: {
                currencyId: cur_mru.id, rate: 3.5, date: new Date("2026-03-01T01:05:26.205Z"),
            }
        });
        await prisma_1.default.currencyRateHistory.create({
            data: {
                currencyId: cur_mad.id, rate: 13, date: new Date("2026-03-01T01:05:26.220Z"),
            }
        });
        await prisma_1.default.currencyRateHistory.create({
            data: {
                currencyId: cur_eur.id, rate: 250, date: new Date("2026-03-01T15:16:46.919Z"),
            }
        });
        // ── Users ────────────────────────────────────────────────────────────
        console.log(' - Creating users...');
        const usr_admin = await prisma_1.default.user.create({
            data: {
                username: "admin", name: "مدير النظام",
                password: adminPassword,
                roleId: roleAdmin.id,
            }
        });
        const usr_mohfadel = await prisma_1.default.user.create({
            data: {
                username: "mohfadel", name: "محمد فاضل",
                password: userPassword,
                roleId: roleResponsable.id,
            }
        });
        const usr_mohsalem = await prisma_1.default.user.create({
            data: {
                username: "mohsalem", name: "محمد سالم",
                password: userPassword,
                roleId: roleEncargado.id,
            }
        });
        // ── Branches ─────────────────────────────────────────────────────────
        const br_main = await prisma_1.default.branch.create({
            data: {
                name: "المركز الرئيسي", code: "MAIN", currencyId: cur_dzd.id,
                users: { connect: [{ id: usr_admin.id }] }
            }
        });
        // ── Chart of Accounts ────────────────────────────────────────────────
        console.log(' - Creating chart of accounts (33 accounts)...');
        const acc_1000 = await prisma_1.default.account.create({
            data: {
                name: "الأصول", code: "1000", type: "ASSET",
                currencyId: cur_dzd.id, branchId: br_main.id,
            }
        });
        const acc_1100 = await prisma_1.default.account.create({
            data: {
                name: "الصناديق النقدية", code: "1100", type: "ASSET",
                currencyId: cur_dzd.id, branchId: br_main.id, parentId: acc_1000.id,
            }
        });
        const acc_1110 = await prisma_1.default.account.create({
            data: {
                name: "صندوق اليورو", code: "1110", type: "ASSET",
                currencyId: cur_eur.id, branchId: br_main.id, parentId: acc_1100.id,
            }
        });
        const acc_1111 = await prisma_1.default.account.create({
            data: {
                name: "صندوق اليورو - نقدي", code: "1111", type: "ASSET",
                currencyId: cur_eur.id, branchId: br_main.id, parentId: acc_1110.id,
            }
        });
        const acc_1120 = await prisma_1.default.account.create({
            data: {
                name: "صندوق الدينار الجزائري", code: "1120", type: "ASSET",
                currencyId: cur_dzd.id, branchId: br_main.id, parentId: acc_1100.id,
            }
        });
        const acc_1121 = await prisma_1.default.account.create({
            data: {
                name: "صندوق الدينار - نقدي", code: "1121", type: "ASSET",
                currencyId: cur_dzd.id, branchId: br_main.id, parentId: acc_1120.id,
            }
        });
        const acc_1200 = await prisma_1.default.account.create({
            data: {
                name: "مستحقات على الأعضاء", code: "1200", type: "ASSET",
                currencyId: cur_dzd.id, branchId: br_main.id, parentId: acc_1000.id,
            }
        });
        const acc_2000 = await prisma_1.default.account.create({
            data: {
                name: "الالتزامات", code: "2000", type: "LIABILITY",
                currencyId: cur_dzd.id, branchId: br_main.id,
            }
        });
        const acc_2100 = await prisma_1.default.account.create({
            data: {
                name: "مساعدات مستحقة للمستفيدين", code: "2100", type: "LIABILITY",
                currencyId: cur_dzd.id, branchId: br_main.id, parentId: acc_2000.id,
            }
        });
        const acc_2200 = await prisma_1.default.account.create({
            data: {
                name: "مصروفات مستحقة", code: "2200", type: "LIABILITY",
                currencyId: cur_dzd.id, branchId: br_main.id, parentId: acc_2000.id,
            }
        });
        const acc_4000 = await prisma_1.default.account.create({
            data: {
                name: "الإيرادات", code: "4000", type: "REVENUE",
                currencyId: cur_dzd.id, branchId: br_main.id,
            }
        });
        const acc_4100 = await prisma_1.default.account.create({
            data: {
                name: "التبرعات النقدية", code: "4100", type: "REVENUE",
                currencyId: cur_dzd.id, branchId: br_main.id, parentId: acc_4000.id,
            }
        });
        const acc_4110 = await prisma_1.default.account.create({
            data: {
                name: "تبرعات باليورو", code: "4110", type: "REVENUE",
                currencyId: cur_eur.id, branchId: br_main.id, parentId: acc_4100.id,
            }
        });
        const acc_4120 = await prisma_1.default.account.create({
            data: {
                name: "تبرعات بالدينار الجزائري", code: "4120", type: "REVENUE",
                currencyId: cur_dzd.id, branchId: br_main.id, parentId: acc_4100.id,
            }
        });
        const acc_4200 = await prisma_1.default.account.create({
            data: {
                name: "مساهمات الأعضاء الشهرية", code: "4200", type: "REVENUE",
                currencyId: cur_dzd.id, branchId: br_main.id, parentId: acc_4000.id,
            }
        });
        const acc_4210 = await prisma_1.default.account.create({
            data: {
                name: "مساهمات باليورو", code: "4210", type: "REVENUE",
                currencyId: cur_eur.id, branchId: br_main.id, parentId: acc_4200.id,
            }
        });
        const acc_4220 = await prisma_1.default.account.create({
            data: {
                name: "مساهمات بالدينار الجزائري", code: "4220", type: "REVENUE",
                currencyId: cur_dzd.id, branchId: br_main.id, parentId: acc_4200.id,
            }
        });
        const acc_4300 = await prisma_1.default.account.create({
            data: {
                name: "إيرادات استثمارية", code: "4300", type: "REVENUE",
                currencyId: cur_dzd.id, branchId: br_main.id, parentId: acc_4000.id,
            }
        });
        const acc_4310 = await prisma_1.default.account.create({
            data: {
                name: "إيرادات استثمارية باليورو", code: "4310", type: "REVENUE",
                currencyId: cur_eur.id, branchId: br_main.id, parentId: acc_4300.id,
            }
        });
        const acc_4320 = await prisma_1.default.account.create({
            data: {
                name: "إيرادات استثمارية بالدينار", code: "4320", type: "REVENUE",
                currencyId: cur_dzd.id, branchId: br_main.id, parentId: acc_4300.id,
            }
        });
        const acc_4900 = await prisma_1.default.account.create({
            data: {
                name: "إيرادات متنوعة", code: "4900", type: "REVENUE",
                currencyId: cur_dzd.id, branchId: br_main.id, parentId: acc_4000.id,
            }
        });
        const acc_4910 = await prisma_1.default.account.create({
            data: {
                name: "إيرادات متنوعة باليورو", code: "4910", type: "REVENUE",
                currencyId: cur_eur.id, branchId: br_main.id, parentId: acc_4900.id,
            }
        });
        const acc_4920 = await prisma_1.default.account.create({
            data: {
                name: "إيرادات متنوعة بالدينار", code: "4920", type: "REVENUE",
                currencyId: cur_dzd.id, branchId: br_main.id, parentId: acc_4900.id,
            }
        });
        const acc_5000 = await prisma_1.default.account.create({
            data: {
                name: "المصروفات", code: "5000", type: "EXPENSE",
                currencyId: cur_dzd.id, branchId: br_main.id,
            }
        });
        const acc_5100 = await prisma_1.default.account.create({
            data: {
                name: "المساعدات الخيرية", code: "5100", type: "EXPENSE",
                currencyId: cur_dzd.id, branchId: br_main.id, parentId: acc_5000.id,
            }
        });
        const acc_5110 = await prisma_1.default.account.create({
            data: {
                name: "مساعدات طبية", code: "5110", type: "EXPENSE",
                currencyId: cur_dzd.id, branchId: br_main.id, parentId: acc_5100.id,
            }
        });
        const acc_5120 = await prisma_1.default.account.create({
            data: {
                name: "مساعدات افطار صائم", code: "5120", type: "EXPENSE",
                currencyId: cur_dzd.id, branchId: br_main.id, parentId: acc_5100.id,
            }
        });
        const acc_5130 = await prisma_1.default.account.create({
            data: {
                name: "مساعدات عيدي الفطر والاضحى", code: "5130", type: "EXPENSE",
                currencyId: cur_dzd.id, branchId: br_main.id, parentId: acc_5100.id,
            }
        });
        const acc_5140 = await prisma_1.default.account.create({
            data: {
                name: "مساعدات طارئة", code: "5140", type: "EXPENSE",
                currencyId: cur_dzd.id, branchId: br_main.id, parentId: acc_5100.id,
            }
        });
        const acc_5200 = await prisma_1.default.account.create({
            data: {
                name: "المصروفات الإدارية", code: "5200", type: "EXPENSE",
                currencyId: cur_dzd.id, branchId: br_main.id, parentId: acc_5000.id,
            }
        });
        const acc_5210 = await prisma_1.default.account.create({
            data: {
                name: "مصروفات قرطاسية ومطبوعات", code: "5210", type: "EXPENSE",
                currencyId: cur_dzd.id, branchId: br_main.id, parentId: acc_5200.id,
            }
        });
        const acc_5220 = await prisma_1.default.account.create({
            data: {
                name: "مصروفات اتصالات", code: "5220", type: "EXPENSE",
                currencyId: cur_dzd.id, branchId: br_main.id, parentId: acc_5200.id,
            }
        });
        const acc_5290 = await prisma_1.default.account.create({
            data: {
                name: "مصروفات متنوعة", code: "5290", type: "EXPENSE",
                currencyId: cur_dzd.id, branchId: br_main.id, parentId: acc_5200.id,
            }
        });
        // ── Journal Entries ──────────────────────────────────────────────────
        console.log(' - Creating journal entries...');
        const je_1 = await prisma_1.default.journalEntry.create({
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
        const ent_boj = await prisma_1.default.entity.create({
            data: {
                name: "ولاية بوجدور", code: "BOJ",
                currencyId: cur_dzd.id, branchId: br_main.id,
                annualSubscription: 1200,
                userId: usr_mohfadel.id,
            }
        });
        const ent_esp = await prisma_1.default.entity.create({
            data: {
                name: "اسبانيا", code: "ESP",
                currencyId: cur_eur.id, branchId: br_main.id,
                annualSubscription: 15,
                userId: usr_mohsalem.id,
            }
        });
        // ── Members ──────────────────────────────────────────────────────────
        const mbr_1 = await prisma_1.default.member.create({
            data: {
                name: "أحمد بن محمد", entityId: ent_boj.id,
                affiliationYear: 2023, status: "ACTIVE",
            }
        });
        const mbr_2 = await prisma_1.default.member.create({
            data: {
                name: "سارة عبد الله", entityId: ent_boj.id,
                affiliationYear: 2024, status: "INACTIVE",
            }
        });
        // ── Subscription Collections ─────────────────────────────────────────
        const col_1 = await prisma_1.default.subscriptionCollection.create({
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
    }
    catch (err) {
        console.error('❌ Seed error:', err);
        process.exit(1);
    }
    finally {
        await prisma_1.default.$disconnect();
    }
}
main();
