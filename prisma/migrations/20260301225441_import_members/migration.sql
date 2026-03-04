-- CreateTable
CREATE TABLE "ImportReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "filename" TEXT NOT NULL,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalRecords" INTEGER NOT NULL,
    "importedCount" INTEGER NOT NULL,
    "errorsCount" INTEGER NOT NULL,
    "errorsDetails" JSONB,
    "userId" TEXT NOT NULL,
    CONSTRAINT "ImportReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
