-- Additive stock requests and inter-location transfers. Transfers post
-- TRANSFER_SHIPPED (source) and TRANSFER_RECEIVED (destination) movements to
-- the existing ledger; no existing table is altered.

-- CreateEnum
CREATE TYPE "StockRequestStatus" AS ENUM ('SUBMITTED', 'APPROVED', 'REJECTED', 'CANCELLED', 'PARTIALLY_FULFILLED', 'FULFILLED');

-- CreateEnum
CREATE TYPE "StockTransferStatus" AS ENUM ('APPROVED', 'SHIPPED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "InventoryPermission" ADD VALUE 'REQUEST_INVENTORY_STOCK';
ALTER TYPE "InventoryPermission" ADD VALUE 'APPROVE_INVENTORY_TRANSFERS';
ALTER TYPE "InventoryPermission" ADD VALUE 'SHIP_INVENTORY_TRANSFERS';
ALTER TYPE "InventoryPermission" ADD VALUE 'RECEIVE_INVENTORY_TRANSFERS';

-- CreateTable
CREATE TABLE "StockRequest" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "clientRequestId" UUID NOT NULL,
    "sourceLocationId" UUID NOT NULL,
    "destinationLocationId" UUID NOT NULL,
    "status" "StockRequestStatus" NOT NULL DEFAULT 'SUBMITTED',
    "notes" VARCHAR(500),
    "requestedById" UUID,
    "requestedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedById" UUID,
    "reviewedAt" TIMESTAMPTZ(3),
    "reviewNotes" VARCHAR(500),
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "StockRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockRequestLine" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "quantity" DECIMAL(20,6) NOT NULL,
    "approvedQuantity" DECIMAL(20,6),

    CONSTRAINT "StockRequestLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockTransfer" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "clientRequestId" UUID NOT NULL,
    "requestId" UUID,
    "sourceLocationId" UUID NOT NULL,
    "destinationLocationId" UUID NOT NULL,
    "status" "StockTransferStatus" NOT NULL DEFAULT 'APPROVED',
    "notes" VARCHAR(500),
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "shippedById" UUID,
    "shippedAt" TIMESTAMPTZ(3),
    "lastReceivedAt" TIMESTAMPTZ(3),
    "closedById" UUID,
    "closedAt" TIMESTAMPTZ(3),
    "closeReason" VARCHAR(500),
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "StockTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockTransferLine" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "transferId" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "quantity" DECIMAL(20,6) NOT NULL,
    "shippedQuantity" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "unitCost" DECIMAL(20,8),
    "receivedQuantity" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "lostQuantity" DECIMAL(20,6) NOT NULL DEFAULT 0,

    CONSTRAINT "StockTransferLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StockRequest_tenantId_status_requestedAt_idx" ON "StockRequest"("tenantId", "status", "requestedAt");

-- CreateIndex
CREATE UNIQUE INDEX "StockRequest_tenantId_clientRequestId_key" ON "StockRequest"("tenantId", "clientRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "StockRequest_id_tenantId_key" ON "StockRequest"("id", "tenantId");

-- CreateIndex
CREATE INDEX "StockRequestLine_tenantId_itemId_idx" ON "StockRequestLine"("tenantId", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "StockRequestLine_requestId_itemId_key" ON "StockRequestLine"("requestId", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "StockTransfer_requestId_key" ON "StockTransfer"("requestId");

-- CreateIndex
CREATE INDEX "StockTransfer_tenantId_status_createdAt_idx" ON "StockTransfer"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "StockTransfer_tenantId_destinationLocationId_status_idx" ON "StockTransfer"("tenantId", "destinationLocationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "StockTransfer_tenantId_clientRequestId_key" ON "StockTransfer"("tenantId", "clientRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "StockTransfer_id_tenantId_key" ON "StockTransfer"("id", "tenantId");

-- CreateIndex
CREATE INDEX "StockTransferLine_tenantId_itemId_idx" ON "StockTransferLine"("tenantId", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "StockTransferLine_transferId_itemId_key" ON "StockTransferLine"("transferId", "itemId");

-- AddForeignKey
ALTER TABLE "StockRequest" ADD CONSTRAINT "StockRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockRequest" ADD CONSTRAINT "StockRequest_sourceLocationId_tenantId_fkey" FOREIGN KEY ("sourceLocationId", "tenantId") REFERENCES "StockLocation"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockRequest" ADD CONSTRAINT "StockRequest_destinationLocationId_tenantId_fkey" FOREIGN KEY ("destinationLocationId", "tenantId") REFERENCES "StockLocation"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockRequest" ADD CONSTRAINT "StockRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockRequest" ADD CONSTRAINT "StockRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockRequestLine" ADD CONSTRAINT "StockRequestLine_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockRequestLine" ADD CONSTRAINT "StockRequestLine_requestId_tenantId_fkey" FOREIGN KEY ("requestId", "tenantId") REFERENCES "StockRequest"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockRequestLine" ADD CONSTRAINT "StockRequestLine_itemId_tenantId_fkey" FOREIGN KEY ("itemId", "tenantId") REFERENCES "InventoryItem"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "StockRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_sourceLocationId_tenantId_fkey" FOREIGN KEY ("sourceLocationId", "tenantId") REFERENCES "StockLocation"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_destinationLocationId_tenantId_fkey" FOREIGN KEY ("destinationLocationId", "tenantId") REFERENCES "StockLocation"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_shippedById_fkey" FOREIGN KEY ("shippedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransferLine" ADD CONSTRAINT "StockTransferLine_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransferLine" ADD CONSTRAINT "StockTransferLine_transferId_tenantId_fkey" FOREIGN KEY ("transferId", "tenantId") REFERENCES "StockTransfer"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransferLine" ADD CONSTRAINT "StockTransferLine_itemId_tenantId_fkey" FOREIGN KEY ("itemId", "tenantId") REFERENCES "InventoryItem"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "StockRequest" ADD CONSTRAINT "StockRequest_locations_check" CHECK ("sourceLocationId" <> "destinationLocationId");
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_locations_check" CHECK ("sourceLocationId" <> "destinationLocationId");
ALTER TABLE "StockRequestLine" ADD CONSTRAINT "StockRequestLine_quantity_check" CHECK ("quantity" > 0 AND ("approvedQuantity" IS NULL OR "approvedQuantity" >= 0));
-- Nothing can be received or written off beyond what was shipped.
ALTER TABLE "StockTransferLine" ADD CONSTRAINT "StockTransferLine_quantity_check" CHECK (
  "quantity" > 0 AND "shippedQuantity" >= 0 AND "shippedQuantity" <= "quantity"
  AND "receivedQuantity" >= 0 AND "lostQuantity" >= 0
  AND "receivedQuantity" + "lostQuantity" <= "shippedQuantity"
);
