import { createClient } from '@libsql/client';
import fs from 'fs';
import 'dotenv/config';

async function main() {
  const url = process.env.DATABASE_URL;
  const authToken = process.env.DATABASE_TOKEN;

  if (!url) {
    console.error('DATABASE_URL is not defined');
    process.exit(1);
  }

  console.log(`Connecting to Turso at ${url}...`);

  const client = createClient({
    url,
    authToken,
  });

  try {
    const sql = fs.readFileSync('migration_utf8.sql', 'utf8');
    // Simple split by semicolon. Note: This might be naive if semicolons are in strings, 
    // but Prisma's generated DDL is usually clean.
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    console.log(`Executing ${statements.length} SQL statements...`);

    // Use a transaction/batch for efficiency and atomicity if possible
    // but splitting is safer for huge scripts
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      process.stdout.write(`Executing statement ${i + 1}/${statements.length}...\r`);
      await client.execute(stmt);
    }
    
    console.log('\nMigration applied successfully!');
  } catch (error) {
    console.error('\nMigration failed:', error);
    process.exit(1);
  } finally {
    client.close();
  }
}

main();
