// Load .env FIRST before reading any env vars (require is synchronous, avoids import hoisting issues)
require('dotenv').config();

import { PrismaClient } from '@prisma/client';
import { PrismaLibSql } from '@prisma/adapter-libsql';

const dbMode = process.env.DB_MODE || 'cloud'; // 'local' | 'cloud'
console.log(`[prisma.ts] DB_MODE = ${dbMode}`);

let prisma: PrismaClient;

if (dbMode === 'local') {
  // ── Local SQLite (better-sqlite3) ──────────────────────────────────────────
  // Prisma 7+: PrismaBetterSqlite3 accepts { url } config, not a Database instance
  const { PrismaBetterSqlite3 } = require('@prisma/adapter-better-sqlite3');
  const dbPath = process.env.LOCAL_DB_PATH || './prisma/dev.db';
  // The adapter expects a file:// URL format
  const dbUrl = dbPath.startsWith('file:') ? dbPath : `file:${dbPath}`;
  const adapter = new PrismaBetterSqlite3({ url: dbUrl });
  prisma = new PrismaClient({ adapter });
  console.log('🗄️  Database: LOCAL (better-sqlite3 →', dbPath, ')');
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
