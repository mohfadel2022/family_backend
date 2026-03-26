-- CreateTable
CREATE TABLE "PageThemeConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "path" TEXT NOT NULL,
    "colorName" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_SubscriptionCollection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "number" INTEGER,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "description" TEXT,
    "totalAmount" DECIMAL NOT NULL DEFAULT 0,
    "branchId" TEXT,
    "debitAccountId" TEXT,
    "creditAccountId" TEXT,
    "journalEntryId" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SubscriptionCollection_debitAccountId_fkey" FOREIGN KEY ("debitAccountId") REFERENCES "Account" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SubscriptionCollection_creditAccountId_fkey" FOREIGN KEY ("creditAccountId") REFERENCES "Account" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SubscriptionCollection_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SubscriptionCollection_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_SubscriptionCollection" ("branchId", "createdAt", "createdBy", "creditAccountId", "date", "debitAccountId", "description", "id", "journalEntryId", "number", "status", "totalAmount", "updatedAt") SELECT "branchId", "createdAt", "createdBy", "creditAccountId", "date", "debitAccountId", "description", "id", "journalEntryId", "number", "status", "totalAmount", "updatedAt" FROM "SubscriptionCollection";
DROP TABLE "SubscriptionCollection";
ALTER TABLE "new_SubscriptionCollection" RENAME TO "SubscriptionCollection";
CREATE UNIQUE INDEX "SubscriptionCollection_journalEntryId_key" ON "SubscriptionCollection"("journalEntryId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "PageThemeConfig_path_key" ON "PageThemeConfig"("path");
