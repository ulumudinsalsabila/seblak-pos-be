-- SaaS foundation: isolate every business record by outlet and retain old data
-- in the default Saung Sunja tenant/outlet.

ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'SUPER_ADMIN';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'MANAGER';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'KITCHEN';

CREATE TYPE "TenantStatus" AS ENUM ('ACTIVE', 'SUSPENDED');
CREATE TYPE "OutletStatus" AS ENUM ('ACTIVE', 'SUSPENDED');
CREATE TYPE "FeeType" AS ENUM ('NONE', 'FIXED', 'PERCENTAGE', 'HYBRID');
CREATE TYPE "FeeLedgerType" AS ENUM ('CHARGE', 'REVERSAL', 'ADJUSTMENT');
CREATE TYPE "FeeLedgerStatus" AS ENUM ('PENDING', 'INVOICED', 'PAID', 'VOID');

CREATE TABLE "Tenant" (
  "id" UUID NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "slug" VARCHAR(80) NOT NULL,
  "status" "TenantStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Outlet" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "code" VARCHAR(50) NOT NULL,
  "status" "OutletStatus" NOT NULL DEFAULT 'ACTIVE',
  "timezone" VARCHAR(50) NOT NULL DEFAULT 'Asia/Jakarta',
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Outlet_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OutletMembership" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "outletId" UUID NOT NULL,
  "role" "Role" NOT NULL,
  "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OutletMembership_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FeeConfig" (
  "id" UUID NOT NULL,
  "outletId" UUID NOT NULL,
  "type" "FeeType" NOT NULL DEFAULT 'NONE',
  "fixedAmount" INTEGER NOT NULL DEFAULT 0,
  "percentage" DECIMAL(7,4) NOT NULL DEFAULT 0,
  "effectiveFrom" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "effectiveTo" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FeeConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FeeLedger" (
  "id" UUID NOT NULL,
  "outletId" UUID NOT NULL,
  "transactionId" UUID,
  "type" "FeeLedgerType" NOT NULL,
  "amount" INTEGER NOT NULL,
  "status" "FeeLedgerStatus" NOT NULL DEFAULT 'PENDING',
  "description" VARCHAR(500),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FeeLedger_pkey" PRIMARY KEY ("id")
);

INSERT INTO "Tenant" ("id", "name", "slug")
VALUES ('10000000-0000-4000-8000-000000000001', 'Saung Sunja', 'saung-sunja');

INSERT INTO "Outlet" ("id", "tenantId", "name", "code")
VALUES (
  '10000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001',
  'Saung Sunja',
  'SUNJA-01'
);

ALTER TABLE "Category" ADD COLUMN "outletId" UUID;
ALTER TABLE "Product" ADD COLUMN "outletId" UUID;
ALTER TABLE "Transaction" ADD COLUMN "outletId" UUID;
ALTER TABLE "Transaction" ADD COLUMN "platformFeeType" "FeeType" NOT NULL DEFAULT 'NONE';
ALTER TABLE "Transaction" ADD COLUMN "platformFeeFixed" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Transaction" ADD COLUMN "platformFeePercentage" DECIMAL(7,4) NOT NULL DEFAULT 0;
ALTER TABLE "Transaction" ADD COLUMN "platformFeeAmount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "TransactionItem" ADD COLUMN "outletId" UUID;
ALTER TABLE "Expense" ADD COLUMN "outletId" UUID;
ALTER TABLE "StoreSettings" ADD COLUMN "outletId" UUID;
ALTER TABLE "StoreSettings" ADD COLUMN "primaryColor" VARCHAR(7) NOT NULL DEFAULT '#0B63F6';
ALTER TABLE "DailyInvoiceCounter" ADD COLUMN "outletId" UUID;

UPDATE "Category" SET "outletId" = '10000000-0000-4000-8000-000000000002';
UPDATE "Product" SET "outletId" = '10000000-0000-4000-8000-000000000002';
UPDATE "Transaction" SET "outletId" = '10000000-0000-4000-8000-000000000002';
UPDATE "TransactionItem" SET "outletId" = '10000000-0000-4000-8000-000000000002';
UPDATE "Expense" SET "outletId" = '10000000-0000-4000-8000-000000000002';
UPDATE "StoreSettings" SET "outletId" = '10000000-0000-4000-8000-000000000002';
UPDATE "DailyInvoiceCounter" SET "outletId" = '10000000-0000-4000-8000-000000000002';

ALTER TABLE "Category" ALTER COLUMN "outletId" SET NOT NULL;
ALTER TABLE "Product" ALTER COLUMN "outletId" SET NOT NULL;
ALTER TABLE "Transaction" ALTER COLUMN "outletId" SET NOT NULL;
ALTER TABLE "TransactionItem" ALTER COLUMN "outletId" SET NOT NULL;
ALTER TABLE "Expense" ALTER COLUMN "outletId" SET NOT NULL;
ALTER TABLE "StoreSettings" ALTER COLUMN "outletId" SET NOT NULL;
ALTER TABLE "DailyInvoiceCounter" ALTER COLUMN "outletId" SET NOT NULL;

INSERT INTO "OutletMembership" (
  "id", "userId", "outletId", "role", "isDefault"
)
SELECT gen_random_uuid(), "id", '10000000-0000-4000-8000-000000000002', "role", true
FROM "User";

INSERT INTO "FeeConfig" (
  "id", "outletId", "type", "fixedAmount", "percentage"
)
VALUES (
  gen_random_uuid(), '10000000-0000-4000-8000-000000000002', 'NONE', 0, 0
);

DROP INDEX "Product_sku_key";
DROP INDEX "Transaction_invoiceNo_key";
DROP INDEX "Transaction_clientTransactionId_key";
ALTER TABLE "DailyInvoiceCounter" DROP CONSTRAINT "DailyInvoiceCounter_pkey";

CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");
CREATE UNIQUE INDEX "Outlet_tenantId_code_key" ON "Outlet"("tenantId", "code");
CREATE INDEX "Outlet_tenantId_status_idx" ON "Outlet"("tenantId", "status");
CREATE UNIQUE INDEX "OutletMembership_userId_outletId_key" ON "OutletMembership"("userId", "outletId");
CREATE INDEX "OutletMembership_outletId_role_idx" ON "OutletMembership"("outletId", "role");
CREATE INDEX "FeeConfig_outletId_effectiveFrom_effectiveTo_idx" ON "FeeConfig"("outletId", "effectiveFrom", "effectiveTo");
CREATE INDEX "FeeLedger_outletId_status_createdAt_idx" ON "FeeLedger"("outletId", "status", "createdAt");
CREATE INDEX "FeeLedger_transactionId_idx" ON "FeeLedger"("transactionId");
CREATE INDEX "Category_outletId_isActive_sortOrder_idx" ON "Category"("outletId", "isActive", "sortOrder");
CREATE UNIQUE INDEX "Product_outletId_sku_key" ON "Product"("outletId", "sku");
CREATE INDEX "Product_outletId_categoryId_isActive_idx" ON "Product"("outletId", "categoryId", "isActive");
CREATE UNIQUE INDEX "Transaction_outletId_invoiceNo_key" ON "Transaction"("outletId", "invoiceNo");
CREATE UNIQUE INDEX "Transaction_outletId_clientTransactionId_key" ON "Transaction"("outletId", "clientTransactionId");
CREATE INDEX "Transaction_outletId_paidAt_status_idx" ON "Transaction"("outletId", "paidAt", "status");
CREATE INDEX "Transaction_outletId_cashierId_paidAt_idx" ON "Transaction"("outletId", "cashierId", "paidAt");
CREATE INDEX "Transaction_outletId_paymentMethod_paidAt_idx" ON "Transaction"("outletId", "paymentMethod", "paidAt");
CREATE INDEX "Transaction_outletId_kitchenStatus_createdAt_idx" ON "Transaction"("outletId", "kitchenStatus", "createdAt");
CREATE INDEX "TransactionItem_outletId_transactionId_idx" ON "TransactionItem"("outletId", "transactionId");
CREATE INDEX "Expense_outletId_expenseDate_idx" ON "Expense"("outletId", "expenseDate");
CREATE UNIQUE INDEX "StoreSettings_outletId_key" ON "StoreSettings"("outletId");
ALTER TABLE "DailyInvoiceCounter" ADD CONSTRAINT "DailyInvoiceCounter_pkey" PRIMARY KEY ("outletId", "businessDate");

-- Remove superseded single-outlet indexes after their replacements exist.
DROP INDEX IF EXISTS "Product_categoryId_isActive_idx";
DROP INDEX IF EXISTS "Transaction_paidAt_status_idx";
DROP INDEX IF EXISTS "Transaction_cashierId_paidAt_idx";
DROP INDEX IF EXISTS "Transaction_paymentMethod_paidAt_idx";
DROP INDEX IF EXISTS "Transaction_kitchenStatus_createdAt_idx";
DROP INDEX IF EXISTS "TransactionItem_transactionId_idx";
DROP INDEX IF EXISTS "Expense_expenseDate_idx";

ALTER TABLE "Outlet" ADD CONSTRAINT "Outlet_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OutletMembership" ADD CONSTRAINT "OutletMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OutletMembership" ADD CONSTRAINT "OutletMembership_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FeeConfig" ADD CONSTRAINT "FeeConfig_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FeeLedger" ADD CONSTRAINT "FeeLedger_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FeeLedger" ADD CONSTRAINT "FeeLedger_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Category" ADD CONSTRAINT "Category_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Product" ADD CONSTRAINT "Product_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TransactionItem" ADD CONSTRAINT "TransactionItem_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StoreSettings" ADD CONSTRAINT "StoreSettings_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DailyInvoiceCounter" ADD CONSTRAINT "DailyInvoiceCounter_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
