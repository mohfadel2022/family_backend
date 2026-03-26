/**
 * export_seed.ts
 * Reads all data from the current SQLite database
 * and writes a new seed.ts that can faithfully restore the same data.
 *
 * Usage:
 *   npx ts-node --transpile-only prisma/export_seed.ts
 */

import { PrismaClient } from '@prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';

const adapter = new PrismaBetterSqlite3({ url: 'prisma/dev.db' });
const prisma = new PrismaClient({ adapter });

const I = (n: number) => '  '.repeat(n);
const q = (v: any) => JSON.stringify(v);
const D = (d: any) => `new Date(${q(new Date(d).toISOString())})`;

async function main() {
    console.log('📦 Exporting current database → seed.ts ...\n');

    // ─── Read all tables ─────────────────────────────────────────────────────
    const currencies   = await prisma.currency.findMany({ orderBy: [{ isBase: 'desc' }, { code: 'asc' }] });
    const ratHistory   = await prisma.currencyRateHistory.findMany({ orderBy: { date: 'asc' } });
    const users        = await prisma.user.findMany({ orderBy: { username: 'asc' } });
    const branches     = await prisma.branch.findMany({ orderBy: { code: 'asc' } });
    const accounts     = await prisma.account.findMany({ orderBy: { code: 'asc' } });
    const entries      = await prisma.journalEntry.findMany({
        orderBy: { entryNumber: 'asc' },
        include: { lines: true }
    });
    const entities = await prisma.entity.findMany({ orderBy: { code: 'asc' } });
    const members  = await prisma.member.findMany({ orderBy: { name: 'asc' } });
    const collections = await prisma.subscriptionCollection.findMany({
        orderBy: { number: 'asc' },
        include: { items: true }
    });

    // ─── ID → variable name maps ─────────────────────────────────────────────
    const cV: Record<string, string> = {};
    currencies.forEach(c => { cV[c.id] = `cur_${c.code.toLowerCase()}`; });

    const bV: Record<string, string> = {};
    branches.forEach(b => { bV[b.id] = `br_${b.code.toLowerCase().replace(/\W/g, '_')}`; });

    const aV: Record<string, string> = {};
    accounts.forEach(a => { aV[a.id] = `acc_${a.code.replace(/\W/g, '_')}`; });

    const uV: Record<string, string> = {};
    users.forEach(u => { uV[u.id] = `usr_${u.username.replace(/\W/g, '_')}`; });

    const eV: Record<string, string> = {};
    entries.forEach(e => { eV[e.id] = `je_${e.entryNumber ?? e.id.substring(0, 8)}`; });

    const entV: Record<string, string> = {};
    entities.forEach(e => { entV[e.id] = `ent_${(e.code ?? e.id.substring(0, 8)).replace(/\W/g, '_')}`; });

    const mV: Record<string, string> = {};
    members.forEach((m, i) => { mV[m.id] = `mbr_${i + 1}`; });

    const colV: Record<string, string> = {};
    collections.forEach((c, i) => { colV[c.id] = `col_${c.number ?? i + 1}`; });

    // ─── Build file lines ─────────────────────────────────────────────────────
    const L: string[] = [];

    L.push(`import { PrismaClient } from '@prisma/client';`);
    L.push(`import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';`);
    L.push(``);
    L.push(`const adapter = new PrismaBetterSqlite3({ url: 'prisma/dev.db' });`);
    L.push(`const prisma  = new PrismaClient({ adapter });`);
    L.push(``);
    L.push(`async function main() {`);
    L.push(`${I(1)}try {`);
    L.push(`${I(2)}console.log('🌱 Seeding exported data...');`);
    L.push(``);

    // ── Clear ─────────────────────────────────────────────────────────────────
    L.push(`${I(2)}// ── Clear ────────────────────────────────────────────────────────────`);
    L.push(`${I(2)}await prisma.subscriptionCollectionItem.deleteMany();`);
    L.push(`${I(2)}await prisma.subscriptionCollection.deleteMany();`);
    L.push(`${I(2)}await prisma.memberSubscription.deleteMany();`);
    L.push(`${I(2)}await prisma.member.deleteMany();`);
    L.push(`${I(2)}await prisma.entity.deleteMany();`);
    L.push(`${I(2)}await prisma.currencyRateHistory.deleteMany();`);
    L.push(`${I(2)}await prisma.journalLine.deleteMany();`);
    L.push(`${I(2)}await prisma.journalEntry.deleteMany();`);
    L.push(`${I(2)}await prisma.auditLog.deleteMany();`);
    L.push(`${I(2)}await prisma.account.deleteMany();`);
    L.push(`${I(2)}await prisma.branch.deleteMany();`);
    L.push(`${I(2)}await prisma.period.deleteMany();`);
    L.push(`${I(2)}await prisma.currency.deleteMany();`);
    L.push(`${I(2)}await prisma.user.deleteMany();`);
    L.push(``);

    // ── Currencies ────────────────────────────────────────────────────────────
    L.push(`${I(2)}// ── Currencies ───────────────────────────────────────────────────────`);
    for (const c of currencies) {
        L.push(`${I(2)}const ${cV[c.id]} = await prisma.currency.create({ data: {`);
        L.push(`${I(3)}name: ${q(c.name)}, code: ${q(c.code)}, symbol: ${q(c.symbol)},`);
        L.push(`${I(3)}isBase: ${c.isBase}, exchangeRate: ${c.exchangeRate},`);
        L.push(`${I(2)}}});`);
    }
    L.push(``);

    // ── Currency Rate History ─────────────────────────────────────────────────
    if (ratHistory.length > 0) {
        L.push(`${I(2)}// ── Currency Rate History ────────────────────────────────────────────`);
        for (const h of ratHistory) {
            const cv = cV[h.currencyId] ?? q(h.currencyId);
            L.push(`${I(2)}await prisma.currencyRateHistory.create({ data: {`);
            L.push(`${I(3)}currencyId: ${cv}.id, rate: ${h.rate}, date: ${D(h.date)},`);
            L.push(`${I(2)}}});`);
        }
        L.push(``);
    }

    // ── Users ─────────────────────────────────────────────────────────────────
    L.push(`${I(2)}// ── Users ────────────────────────────────────────────────────────────`);
    for (const u of users) {
        L.push(`${I(2)}const ${uV[u.id]} = await prisma.user.create({ data: {`);
        L.push(`${I(3)}username: ${q(u.username)}, name: ${q(u.name)},`);
        L.push(`${I(3)}password: ${q(u.password)}, // bcrypt hash`);
        L.push(`${I(3)}role: ${q(u.roleId)},`);
        L.push(`${I(2)}}});`);
    }
    L.push(``);

    // ── Branches ──────────────────────────────────────────────────────────────
    L.push(`${I(2)}// ── Branches ─────────────────────────────────────────────────────────`);
    for (const b of branches) {
        const cv = cV[b.currencyId] ?? q(b.currencyId);
        L.push(`${I(2)}const ${bV[b.id]} = await prisma.branch.create({ data: {`);
        L.push(`${I(3)}name: ${q(b.name)}, code: ${q(b.code)}, currencyId: ${cv}.id,`);
        L.push(`${I(2)}}});`);
    }
    L.push(``);

    // ── Accounts (topological) ────────────────────────────────────────────────
    L.push(`${I(2)}// ── Chart of Accounts ────────────────────────────────────────────────`);
    const byId: Record<string, typeof accounts[0]> = {};
    accounts.forEach(a => { byId[a.id] = a; });
    const ordered: typeof accounts = [];
    const seen = new Set<string>();
    function visit(id: string) {
        if (seen.has(id)) return;
        const a = byId[id]; if (!a) return;
        if (a.parentId) visit(a.parentId);
        if (!seen.has(id)) { seen.add(id); ordered.push(a); }
    }
    accounts.forEach(a => visit(a.id));

    for (const a of ordered) {
        const cv = cV[a.currencyId] ?? q(a.currencyId);
        const bv = bV[a.branchId]  ?? q(a.branchId);
        const par = a.parentId ? `, parentId: ${aV[a.parentId] ?? q(a.parentId)}.id` : '';
        L.push(`${I(2)}const ${aV[a.id]} = await prisma.account.create({ data: {`);
        L.push(`${I(3)}name: ${q(a.name)}, code: ${q(a.code)}, type: ${q(a.type)},`);
        L.push(`${I(3)}currencyId: ${cv}.id, branchId: ${bv}.id${par},`);
        L.push(`${I(2)}}});`);
    }
    L.push(``);

    // ── Journal Entries ───────────────────────────────────────────────────────
    if (entries.length > 0) {
        L.push(`${I(2)}// ── Journal Entries ──────────────────────────────────────────────────`);
        for (const e of entries) {
            const bv = bV[e.branchId] ?? q(e.branchId);
            const uv = uV[e.createdBy] ?? q(e.createdBy);
            L.push(`${I(2)}const ${eV[e.id]} = await prisma.journalEntry.create({ data: {`);
            L.push(`${I(3)}entryNumber: ${q(e.entryNumber)}, description: ${q(e.description)},`);
            L.push(`${I(3)}date: ${D(e.date)}, status: ${q(e.status)}, type: ${q(e.type)},`);
            L.push(`${I(3)}branchId: ${bv}.id, totalAmount: ${e.totalAmount}, createdBy: ${uv}.id,`);
            L.push(`${I(3)}lines: { create: [`);
            for (const l of e.lines) {
                const av = aV[l.accountId] ?? q(l.accountId);
                const cv = cV[l.currencyId] ?? q(l.currencyId);
                L.push(`${I(4)}{ accountId: ${av}.id, currencyId: ${cv}.id,`);
                L.push(`${I(5)}debit: ${l.debit}, credit: ${l.credit}, exchangeRate: ${l.exchangeRate},`);
                L.push(`${I(5)}baseDebit: ${l.baseDebit}, baseCredit: ${l.baseCredit} },`);
            }
            L.push(`${I(3)}]},`);
            L.push(`${I(2)}}});`);
        }
        L.push(``);
    }

    // ── Entities ──────────────────────────────────────────────────────────────
    if (entities.length > 0) {
        L.push(`${I(2)}// ── Entities (جهات الاشتراك) ─────────────────────────────────────────`);
        for (const e of entities) {
            const cv = cV[e.currencyId] ?? q(e.currencyId);
            const bv = bV[e.branchId]  ?? q(e.branchId);
            L.push(`${I(2)}const ${entV[e.id]} = await prisma.entity.create({ data: {`);
            L.push(`${I(3)}name: ${q(e.name)}, code: ${q(e.code)},`);
            L.push(`${I(3)}currencyId: ${cv}.id, branchId: ${bv}.id,`);
            L.push(`${I(3)}annualSubscription: ${e.annualSubscription},`);
            if (e.userId) L.push(`${I(3)}userId: ${uV[e.userId] ?? q(e.userId)}.id,`);
            L.push(`${I(2)}}});`);
        }
        L.push(``);
    }

    // ── Members ───────────────────────────────────────────────────────────────
    if (members.length > 0) {
        L.push(`${I(2)}// ── Members ──────────────────────────────────────────────────────────`);
        for (const m of members) {
            const ev = entV[m.entityId] ?? q(m.entityId);
            L.push(`${I(2)}const ${mV[m.id]} = await prisma.member.create({ data: {`);
            L.push(`${I(3)}name: ${q(m.name)}, entityId: ${ev}.id,`);
            L.push(`${I(3)}affiliationYear: ${m.affiliationYear}, status: ${q(m.status)},`);
            L.push(`${I(2)}}});`);
        }
        L.push(``);
    }

    // ── Subscription Collections ──────────────────────────────────────────────
    if (collections.length > 0) {
        L.push(`${I(2)}// ── Subscription Collections ─────────────────────────────────────────`);
        for (const col of collections) {
            const uv  = uV[col.createdBy] ?? q(col.createdBy);
            const jev = col.journalEntryId ? (eV[col.journalEntryId] ?? null) : null;
            const dav = col.debitAccountId  ? (aV[col.debitAccountId]  ?? null) : null;
            const cav = col.creditAccountId ? (aV[col.creditAccountId] ?? null) : null;
            const bv  = col.branchId        ? (bV[col.branchId]         ?? null) : null;
            L.push(`${I(2)}const ${colV[col.id]} = await prisma.subscriptionCollection.create({ data: {`);
            L.push(`${I(3)}number: ${q(col.number)}, date: ${D(col.date)},`);
            L.push(`${I(3)}status: ${q(col.status)}, description: ${q(col.description)},`);
            L.push(`${I(3)}totalAmount: ${col.totalAmount}, createdBy: ${uv}.id,`);
            if (bv)  L.push(`${I(3)}branchId: ${bv}.id,`);
            if (dav) L.push(`${I(3)}debitAccountId: ${dav}.id,`);
            if (cav) L.push(`${I(3)}creditAccountId: ${cav}.id,`);
            if (jev) L.push(`${I(3)}journalEntryId: ${jev}.id,`);
            if (col.items.length > 0) {
                L.push(`${I(3)}items: { create: [`);
                for (const it of col.items) {
                    const mv = mV[it.memberId] ?? q(it.memberId);
                    L.push(`${I(4)}{ memberId: ${mv}.id, year: ${it.year}, amount: ${it.amount} },`);
                }
                L.push(`${I(3)}]},`);
            }
            L.push(`${I(2)}}});`);
        }
        L.push(``);
    }

    // ── Summary ───────────────────────────────────────────────────────────────
    L.push(`${I(2)}console.log('✅ Seed restored:');`);
    L.push(`${I(2)}console.log('   currencies: ${currencies.length}, users: ${users.length}, branches: ${branches.length}');`);
    L.push(`${I(2)}console.log('   accounts: ${accounts.length}, journal entries: ${entries.length}');`);
    L.push(`${I(2)}console.log('   entities: ${entities.length}, members: ${members.length}, collections: ${collections.length}');`);
    L.push(``);
    L.push(`${I(1)}} catch (e) {`);
    L.push(`${I(2)}console.error('Seed failed:', e);`);
    L.push(`${I(2)}process.exit(1);`);
    L.push(`${I(1)}} finally {`);
    L.push(`${I(2)}await prisma.$disconnect();`);
    L.push(`${I(1)}}`);
    L.push(`}`);
    L.push(``);
    L.push(`main();`);
    L.push(``);

    // ─── Write ────────────────────────────────────────────────────────────────
    const outPath = path.join(__dirname, 'seed.ts');
    fs.writeFileSync(outPath, L.join('\n'), 'utf8');

    console.log('✅ seed.ts written!');
    console.log({
        currencies:   currencies.length,
        rateHistory:  ratHistory.length,
        users:        users.length,
        branches:     branches.length,
        accounts:     accounts.length,
        journalEntries: entries.length,
        entities:     entities.length,
        members:      members.length,
        collections:  collections.length,
    });
    console.log(`\n📄 ${outPath}`);
}

main().finally(() => prisma.$disconnect());
