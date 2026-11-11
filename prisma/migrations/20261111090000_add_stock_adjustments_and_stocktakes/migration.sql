-- Additive waste/adjustment documents and stock count sessions. Both post
-- WASTE_POSTED / ADJUSTMENT_POSTED / STOCKTAKE_VARIANCE_POSTED movements to the
-- existing ledger; no existing table is altered.

-- CreateEnum
CREATE TYPE "StockAdjustmentKind" AS ENUM ('WASTE', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "StockAdjustmentReason" AS ENUM ('EXPIRED', 'SPOILED', 'SPILLED', 'DAMAGED', 'STAFF_MEAL', 'COUNT_CORRECTION', 'FOUND', 'OTHER');

-- CreateEnum
CREATE TYPE "StocktakeStatus" AS ENUM ('COUNTING', 'REVIEW', 'POSTED', 'CANCELLED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "InventoryPermission" ADD VALUE 'POST_INVENTORY_WASTE';
ALTER TYPE "InventoryPermission" ADD VALUE 'POST_INVENTORY_ADJUSTMENTS';
ALTER TYPE "InventoryPermission" ADD VALUE 'COUNT_INVENTORY_STOCKTAKE';
ALTER TYPE "InventoryPermission" ADD VALUE 'APPROVE_INVENTORY_STOCKTAKE';

-- CreateTable
CREATE TABLE "StockAdjustment" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "clientRequestId" UUID NOT NULL,
    "kind" "StockAdjustmentKind" NOT NULL,
    "reason" "StockAdjustmentReason" NOT NULL,
    "notes" VARCHAR(500),
    "totalAmount" DECIMAL(20,6),
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockAdjustmentLine" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "adjustmentId" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "unitId" UUID NOT NULL,
    "direction" "StockMovementDirection" NOT NULL,
    "inputQuantity" DECIMAL(20,6) NOT NULL,
    "factorToBase" DECIMAL(20,9) NOT NULL,
    "quantity" DECIMAL(20,6) NOT NULL,
    "unitCost" DECIMAL(20,8),
    "amount" DECIMAL(20,6),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockAdjustmentLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Stocktake" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "clientRequestId" UUID NOT NULL,
    "status" "StocktakeStatus" NOT NULL DEFAULT 'COUNTING',
    "notes" VARCHAR(500),
    "createdById" UUID,
    "submittedById" UUID,
    "submittedAt" TIMESTAMPTZ(3),
    "approvedById" UUID,
    "postedAt" TIMESTAMPTZ(3),
    "cancelledById" UUID,
    "cancelledAt" TIMESTAMPTZ(3),
    "cancelReason" VARCHAR(500),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Stocktake_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StocktakeLine" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "stocktakeId" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "unitId" UUID NOT NULL,
    "inputQuantity" DECIMAL(20,6) NOT NULL,
    "factorToBase" DECIMAL(20,9) NOT NULL,
    "countedQuantity" DECIMAL(20,6) NOT NULL,
    "expectedQuantity" DECIMAL(20,6) NOT NULL,
    "varianceQuantity" DECIMAL(20,6) NOT NULL,
    "unitCost" DECIMAL(20,8),
    "varianceAmount" DECIMAL(20,6),
    "notes" VARCHAR(500),
    "countedById" UUID,
    "countedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StocktakeLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StockAdjustment_tenantId_kind_occurredAt_idx" ON "StockAdjustment"("tenantId", "kind", "occurredAt");

-- CreateIndex
CREATE INDEX "StockAdjustment_tenantId_locationId_occurredAt_idx" ON "StockAdjustment"("tenantId", "locationId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "StockAdjustment_tenantId_clientRequestId_key" ON "StockAdjustment"("tenantId", "clientRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "StockAdjustment_id_tenantId_key" ON "StockAdjustment"("id", "tenantId");

-- CreateIndex
CREATE INDEX "StockAdjustmentLine_tenantId_itemId_idx" ON "StockAdjustmentLine"("tenantId", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "StockAdjustmentLine_adjustmentId_itemId_key" ON "StockAdjustmentLine"("adjustmentId", "itemId");

-- CreateIndex
CREATE INDEX "Stocktake_tenantId_status_createdAt_idx" ON "Stocktake"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Stocktake_tenantId_locationId_createdAt_idx" ON "Stocktake"("tenantId", "locationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Stocktake_tenantId_clientRequestId_key" ON "Stocktake"("tenantId", "clientRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "Stocktake_id_tenantId_key" ON "Stocktake"("id", "tenantId");

-- CreateIndex
CREATE INDEX "StocktakeLine_tenantId_itemId_idx" ON "StocktakeLine"("tenantId", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "StocktakeLine_stocktakeId_itemId_key" ON "StocktakeLine"("stocktakeId", "itemId");

-- AddForeignKey
ALTER TABLE "StockAdjustment" ADD CONSTRAINT "StockAdjustment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockAdjustment" ADD CONSTRAINT "StockAdjustment_locationId_tenantId_fkey" FOREIGN KEY ("locationId", "tenantId") REFERENCES "StockLocation"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockAdjustment" ADD CONSTRAINT "StockAdjustment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockAdjustmentLine" ADD CONSTRAINT "StockAdjustmentLine_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockAdjustmentLine" ADD CONSTRAINT "StockAdjustmentLine_adjustmentId_tenantId_fkey" FOREIGN KEY ("adjustmentId", "tenantId") REFERENCES "StockAdjustment"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockAdjustmentLine" ADD CONSTRAINT "StockAdjustmentLine_itemId_tenantId_fkey" FOREIGN KEY ("itemId", "tenantId") REFERENCES "InventoryItem"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockAdjustmentLine" ADD CONSTRAINT "StockAdjustmentLine_unitId_tenantId_fkey" FOREIGN KEY ("unitId", "tenantId") REFERENCES "InventoryUnit"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stocktake" ADD CONSTRAINT "Stocktake_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stocktake" ADD CONSTRAINT "Stocktake_locationId_tenantId_fkey" FOREIGN KEY ("locationId", "tenantId") REFERENCES "StockLocation"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stocktake" ADD CONSTRAINT "Stocktake_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stocktake" ADD CONSTRAINT "Stocktake_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stocktake" ADD CONSTRAINT "Stocktake_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stocktake" ADD CONSTRAINT "Stocktake_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StocktakeLine" ADD CONSTRAINT "StocktakeLine_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StocktakeLine" ADD CONSTRAINT "StocktakeLine_stocktakeId_tenantId_fkey" FOREIGN KEY ("stocktakeId", "tenantId") REFERENCES "Stocktake"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StocktakeLine" ADD CONSTRAINT "StocktakeLine_itemId_tenantId_fkey" FOREIGN KEY ("itemId", "tenantId") REFERENCES "InventoryItem"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StocktakeLine" ADD CONSTRAINT "StocktakeLine_unitId_tenantId_fkey" FOREIGN KEY ("unitId", "tenantId") REFERENCES "InventoryUnit"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StocktakeLine" ADD CONSTRAINT "StocktakeLine_countedById_fkey" FOREIGN KEY ("countedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Quantities are always positive; direction carries the sign.
ALTER TABLE "StockAdjustmentLine" ADD CONSTRAINT "StockAdjustmentLine_quantity_check" CHECK ("inputQuantity" > 0 AND "quantity" > 0);
ALTER TABLE "StockAdjustmentLine" ADD CONSTRAINT "StockAdjustmentLine_factor_check" CHECK ("factorToBase" > 0);
ALTER TABLE "StocktakeLine" ADD CONSTRAINT "StocktakeLine_quantity_check" CHECK ("inputQuantity" >= 0 AND "countedQuantity" >= 0);
ALTER TABLE "StocktakeLine" ADD CONSTRAINT "StocktakeLine_factor_check" CHECK ("factorToBase" > 0);

-- One open count session per location; posted and cancelled sessions are history.
CREATE UNIQUE INDEX "Stocktake_open_location_key" ON "Stocktake"("tenantId", "locationId") WHERE "status" IN ('COUNTING', 'REVIEW');
