-- CreateTable
CREATE TABLE "Currency" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "isBase" BOOLEAN NOT NULL DEFAULT false,
    "exchangeRate" DECIMAL NOT NULL DEFAULT 1
);

-- CreateTable
CREATE TABLE "CurrencyRateHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "currencyId" TEXT NOT NULL,
    "rate" DECIMAL NOT NULL,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CurrencyRateHistory_currencyId_fkey" FOREIGN KEY ("currencyId") REFERENCES "Currency" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Branch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "currencyId" TEXT NOT NULL,
    CONSTRAINT "Branch_currencyId_fkey" FOREIGN KEY ("currencyId") REFERENCES "Currency" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Entity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "currencyId" TEXT NOT NULL,
    "userId" TEXT,
    "annualSubscription" DECIMAL NOT NULL DEFAULT 0,
    "branchId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Entity_currencyId_fkey" FOREIGN KEY ("currencyId") REFERENCES "Currency" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Entity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Entity_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Member" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "paymentEntityId" TEXT,
    "affiliationYear" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "stoppedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "phone" TEXT,
    "managerId" TEXT,
    CONSTRAINT "Member_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Member_paymentEntityId_fkey" FOREIGN KEY ("paymentEntityId") REFERENCES "Entity" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Member_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "Member" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MemberExemption" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "memberId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "reason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MemberExemption_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MemberSubscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "memberId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "journalEntryId" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    CONSTRAINT "MemberSubscription_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "MemberSubscription_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "branchId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "currencyId" TEXT NOT NULL,
    "parentId" TEXT,
    CONSTRAINT "Account_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Account_currencyId_fkey" FOREIGN KEY ("currencyId") REFERENCES "Currency" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Account_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Account" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "JournalEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "branchId" TEXT NOT NULL,
    "entryNumber" INTEGER,
    "type" TEXT NOT NULL DEFAULT 'GENERAL',
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT,
    "totalAmount" DECIMAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "JournalEntry_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "JournalEntry_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileType" TEXT,
    "fileSize" INTEGER,
    "journalEntryId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Attachment_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "JournalLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "journalEntryId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "currencyId" TEXT NOT NULL,
    "debit" DECIMAL NOT NULL DEFAULT 0,
    "credit" DECIMAL NOT NULL DEFAULT 0,
    "exchangeRate" DECIMAL NOT NULL DEFAULT 1,
    "baseDebit" DECIMAL NOT NULL DEFAULT 0,
    "baseCredit" DECIMAL NOT NULL DEFAULT 0,
    CONSTRAINT "JournalLine_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "JournalLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "JournalLine_currencyId_fkey" FOREIGN KEY ("currencyId") REFERENCES "Currency" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "JournalLineCostCenter" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "lineId" TEXT NOT NULL,
    "costCenterId" TEXT NOT NULL,
    "percentage" DECIMAL NOT NULL DEFAULT 100,
    CONSTRAINT "JournalLineCostCenter_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "JournalLine" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "JournalLineCostCenter_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "CostCenter" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CostCenter" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "branchId" TEXT NOT NULL,
    "parentId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CostCenter_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CostCenter_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "CostCenter" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'GENERAL',
    "description" TEXT
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,

    PRIMARY KEY ("roleId", "permissionId"),
    CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "roleId" TEXT,
    "resetToken" TEXT,
    "resetExpires" DATETIME,
    CONSTRAINT "User_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'OPERATION',
    "type" TEXT NOT NULL,
    "link" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Period" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "isLocked" BOOLEAN NOT NULL DEFAULT false
);

-- CreateTable
CREATE TABLE "SubscriptionCollection" (
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

-- CreateTable
CREATE TABLE "SubscriptionCollectionItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "collectionId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "amount" DECIMAL NOT NULL,
    CONSTRAINT "SubscriptionCollectionItem_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "SubscriptionCollection" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SubscriptionCollectionItem_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

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

-- CreateTable
CREATE TABLE "PageThemeConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "path" TEXT NOT NULL,
    "colorName" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "SystemConfig" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "backupFrequency" TEXT NOT NULL DEFAULT 'NONE',
    "lastBackupAt" DATETIME,
    "nextBackupAt" DATETIME,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "_BranchUsers" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_BranchUsers_A_fkey" FOREIGN KEY ("A") REFERENCES "Branch" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_BranchUsers_B_fkey" FOREIGN KEY ("B") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Currency_code_key" ON "Currency"("code");

-- CreateIndex
CREATE INDEX "CurrencyRateHistory_currencyId_date_idx" ON "CurrencyRateHistory"("currencyId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Branch_code_key" ON "Branch"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Entity_code_key" ON "Entity"("code");

-- CreateIndex
CREATE UNIQUE INDEX "MemberExemption_memberId_year_key" ON "MemberExemption"("memberId", "year");

-- CreateIndex
CREATE UNIQUE INDEX "MemberSubscription_memberId_year_key" ON "MemberSubscription"("memberId", "year");

-- CreateIndex
CREATE UNIQUE INDEX "Account_code_key" ON "Account"("code");

-- CreateIndex
CREATE UNIQUE INDEX "CostCenter_code_key" ON "CostCenter"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_code_key" ON "Permission"("code");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Notification_userId_isRead_category_idx" ON "Notification"("userId", "isRead", "category");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionCollection_journalEntryId_key" ON "SubscriptionCollection"("journalEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "PageThemeConfig_path_key" ON "PageThemeConfig"("path");

-- CreateIndex
CREATE UNIQUE INDEX "_BranchUsers_AB_unique" ON "_BranchUsers"("A", "B");

-- CreateIndex
CREATE INDEX "_BranchUsers_B_index" ON "_BranchUsers"("B");


