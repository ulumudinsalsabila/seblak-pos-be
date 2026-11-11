-- Additive: ingredients consumed by menu option values, and a system waste
-- reason for orders voided after the kitchen completed them. No existing
-- table is altered.

-- AlterEnum
ALTER TYPE "StockAdjustmentReason" ADD VALUE 'VOIDED_ORDER';

-- CreateTable
CREATE TABLE "MenuOptionConsumption" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "outletId" UUID NOT NULL,
    "groupId" VARCHAR(50) NOT NULL,
    "valueId" VARCHAR(50) NOT NULL,
    "locationId" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "quantity" DECIMAL(20,6) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "MenuOptionConsumption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MenuOptionConsumption_tenantId_itemId_idx" ON "MenuOptionConsumption"("tenantId", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "MenuOptionConsumption_outletId_groupId_valueId_itemId_key" ON "MenuOptionConsumption"("outletId", "groupId", "valueId", "itemId");

-- AddForeignKey
ALTER TABLE "MenuOptionConsumption" ADD CONSTRAINT "MenuOptionConsumption_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuOptionConsumption" ADD CONSTRAINT "MenuOptionConsumption_outletId_tenantId_fkey" FOREIGN KEY ("outletId", "tenantId") REFERENCES "Outlet"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuOptionConsumption" ADD CONSTRAINT "MenuOptionConsumption_locationId_tenantId_fkey" FOREIGN KEY ("locationId", "tenantId") REFERENCES "StockLocation"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuOptionConsumption" ADD CONSTRAINT "MenuOptionConsumption_itemId_tenantId_fkey" FOREIGN KEY ("itemId", "tenantId") REFERENCES "InventoryItem"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "MenuOptionConsumption" ADD CONSTRAINT "MenuOptionConsumption_quantity_check" CHECK ("quantity" > 0);
