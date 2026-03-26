-- CreateTable
CREATE TABLE "SystemConfig" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "backupFrequency" TEXT NOT NULL DEFAULT 'NONE',
    "lastBackupAt" DATETIME,
    "nextBackupAt" DATETIME,
    "updatedAt" DATETIME NOT NULL
);
