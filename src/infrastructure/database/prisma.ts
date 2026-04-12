import { PrismaClient } from '@prisma/client';
import { PrismaLibSql } from '@prisma/adapter-libsql';
import 'dotenv/config';

const dbMode = process.env.DB_MODE || 'cloud'; // 'local' | 'cloud'

let prisma: PrismaClient;

if (dbMode === 'local') {
  // ── Local SQLite (better-sqlite3) ──────────────────────────────────────────
  const { PrismaAdapterBetterSqlite3 } = require('@prisma/adapter-better-sqlite3');
  const Database = require('better-sqlite3');
  const localDb = new Database(process.env.LOCAL_DB_PATH || './dev.db');
  const adapter = new PrismaAdapterBetterSqlite3(localDb);
  prisma = new PrismaClient({ adapter });
  console.log('🗄️  Database: LOCAL (better-sqlite3 →', process.env.LOCAL_DB_PATH || './dev.db', ')');
} else {
  // ── Turso Cloud (LibSQL) ───────────────────────────────────────────────────
  const tursoUrl = process.env.TURSO_DATABASE_URL || process.env.DATABASE_URL;
  const adapter = new PrismaLibSql({
    url: tursoUrl!,
    authToken: process.env.DATABASE_TOKEN,
  });
  prisma = new PrismaClient({ adapter });
  console.log('☁️  Database: CLOUD (Turso →', tursoUrl, ')');
}

export default prisma;
