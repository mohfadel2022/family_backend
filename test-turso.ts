import { PrismaClient } from '@prisma/client';
import { PrismaLibSql } from '@prisma/adapter-libsql';
import { createClient } from '@libsql/client';
import 'dotenv/config';

async function main() {
  console.log('Testing Turso connectivity...');
  console.log('URL:', process.env.DATABASE_URL);
  
  const adapter = new PrismaLibSql({
    url: process.env.DATABASE_URL!,
    authToken: process.env.DATABASE_TOKEN,
  });
  const prisma = new PrismaClient({ adapter });

  try {
    const start = Date.now();
    await prisma.$connect();
    console.log('Connected successfully to Turso!');
    
    // Try a simple query
    const count = await prisma.user.count();
    console.log('User count:', count);
    
    console.log('Time taken:', Date.now() - start, 'ms');
  } catch (error) {
    console.error('Connection failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
