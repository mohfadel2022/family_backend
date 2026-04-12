import { PrismaClient } from '@prisma/client';
import { PrismaLibSql } from '@prisma/adapter-libsql';
import 'dotenv/config';

const adapter = new PrismaLibSql({
  url: process.env.DATABASE_URL!,
  authToken: process.env.DATABASE_TOKEN,
});

const prisma = new PrismaClient({ adapter });

export default prisma;
