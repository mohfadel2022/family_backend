import { PrismaClient } from '@prisma/client';
import { PrismaLibSql } from '@prisma/adapter-libsql';
import 'dotenv/config';

const tursoUrl = process.env.TURSO_DATABASE_URL || process.env.DATABASE_URL;

const adapter = new PrismaLibSql({
  url: tursoUrl!,
  authToken: process.env.DATABASE_TOKEN,
});

const prisma = new PrismaClient({ adapter });

export default prisma;
