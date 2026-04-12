import { createClient } from "@libsql/client";
import Database from "better-sqlite3";
import * as dotenv from "dotenv";
import * as path from "path";

// Load environment variables
dotenv.config({ path: path.join(__dirname, ".env") });

const devDbPath = path.join(__dirname, "prisma", "dev.db");
const tursoUrl = process.env.DATABASE_URL;
const tursoToken = process.env.DATABASE_TOKEN;

if (!tursoUrl || !tursoToken) {
    console.error("DATABASE_URL and DATABASE_TOKEN must be set in .env");
    process.exit(1);
}

const localDb = new Database(devDbPath);
const tursoClient = createClient({
    url: tursoUrl,
    authToken: tursoToken,
});

// Table migration order (to satisfy foreign keys)
const tables = [
    "Role",
    "Permission",
    "RolePermission",
    "User",
    "Currency",
    "CurrencyRateHistory",
    "Branch",
    "Account",
    "CostCenter",
    "Entity",
    "Member",
    "MemberExemption",
    "JournalEntry",
    "JournalLine",
    "JournalLineCostCenter",
    "Attachment",
    "MemberSubscription",
    "Period",
    "SubscriptionCollection",
    "SubscriptionCollectionItem",
    "ImportReport",
    "PageThemeConfig",
    "SystemConfig",
    "AuditLog",
    "Notification"
];

async function migrate() {
    console.log("🚀 Starting data migration from SQLite to Turso...");

    try {
        // 1. Disable foreign keys temporarily if possible or clear in reverse order
        console.log("🧹 Clearing target database...");
        for (const table of [...tables].reverse()) {
            console.log(`   Cleaning table: ${table}`);
            await tursoClient.execute(`DELETE FROM "${table}"`);
        }

        // 2. Migrate data table by table
        for (const table of tables) {
            console.log(`📦 Migrating table: ${table}...`);
            
            const rows = localDb.prepare(`SELECT * FROM "${table}"`).all();
            if (rows.length === 0) {
                console.log(`   Table ${table} is empty. Skipping.`);
                continue;
            }

            console.log(`   Found ${rows.length} rows. Uploading...`);

            // Chunk rows into batches of 50 to avoid payload limits
            const chunkSize = 50;
            for (let i = 0; i < rows.length; i += chunkSize) {
                const chunk = rows.slice(i, i + chunkSize);
                
                const batch = chunk.map((row: any) => {
                    const columns = Object.keys(row);
                    const values = Object.values(row).map(v => {
                        if (v === null) return null;
                        if (typeof v === 'boolean') return v ? 1 : 0;
                        if (v instanceof Uint8Array || v instanceof Buffer) return v;
                        // Handle potential dates or objects if necessary, but SQLite stores them as strings/blobs
                        return v;
                    });
                    
                    const placeholders = columns.map(() => "?").join(", ");
                    return {
                        sql: `INSERT INTO "${table}" (${columns.map(c => `"${c}"`).join(", ")}) VALUES (${placeholders})`,
                        args: values as any[]
                    };
                });

                await tursoClient.batch(batch, "write");
                console.log(`   ✅ Progress: ${Math.min(i + chunkSize, rows.length)}/${rows.length}`);
            }
        }

        console.log("✨ Migration completed successfully!");
    } catch (error) {
        console.error("❌ Migration failed:");
        console.error(error);
        process.exit(1);
    } finally {
        localDb.close();
    }
}

migrate();
