-- Additive purchase receiving. Receipts post PURCHASE_RECEIVED movements to the
-- existing ledger; no existing table is altered.

ALTER TYPE "InventoryPermission" ADD VALUE 'RECEIVE_INVENTORY_PURCHASES';

CREATE TABLE "PurchaseReceipt" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "clientRequestId" UUID NOT NULL,
    "supplierName" VARCHAR(150) NOT NULL,
    "referenceNo" VARCHAR(100),
    "notes" VARCHAR(500),
    "totalAmount" DECIMAL(20,6) NOT NULL,
    "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PurchaseReceipt_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PurchaseReceipt_total_check" CHECK ("totalAmount" >= 0)
);

CREATE TABLE "PurchaseReceiptLine" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "receiptId" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "unitId" UUID NOT NULL,
    "inputQuantity" DECIMAL(20,6) NOT NULL,
    "inputUnitPrice" DECIMAL(20,8) NOT NULL,
    "factorToBase" DECIMAL(20,9) NOT NULL,
    "quantity" DECIMAL(20,6) NOT NULL,
    "unitCost" DECIMAL(20,8) NOT NULL,
    "amount" DECIMAL(20,6) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PurchaseReceiptLine_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PurchaseReceiptLine_quantity_check" CHECK ("inputQuantity" > 0 AND "quantity" > 0),
    CONSTRAINT "PurchaseReceiptLine_factor_check" CHECK ("factorToBase" > 0),
    CONSTRAINT "PurchaseReceiptLine_cost_check" CHECK ("inputUnitPrice" >= 0 AND "unitCost" >= 0 AND "amount" >= 0)
);

CREATE UNIQUE INDEX "PurchaseReceipt_tenantId_clientRequestId_key" ON "PurchaseReceipt"("tenantId", "clientRequestId");
CREATE UNIQUE INDEX "PurchaseReceipt_id_tenantId_key" ON "PurchaseReceipt"("id", "tenantId");
CREATE INDEX "PurchaseReceipt_tenantId_receivedAt_idx" ON "PurchaseReceipt"("tenantId", "receivedAt");
CREATE INDEX "PurchaseReceipt_tenantId_locationId_receivedAt_idx" ON "PurchaseReceipt"("tenantId", "locationId", "receivedAt");
CREATE UNIQUE INDEX "PurchaseReceiptLine_receiptId_itemId_key" ON "PurchaseReceiptLine"("receiptId", "itemId");
CREATE INDEX "PurchaseReceiptLine_tenantId_itemId_idx" ON "PurchaseReceiptLine"("tenantId", "itemId");

ALTER TABLE "PurchaseReceipt" ADD CONSTRAINT "PurchaseReceipt_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseReceipt" ADD CONSTRAINT "PurchaseReceipt_locationId_tenantId_fkey" FOREIGN KEY ("locationId", "tenantId") REFERENCES "StockLocation"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseReceipt" ADD CONSTRAINT "PurchaseReceipt_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PurchaseReceiptLine" ADD CONSTRAINT "PurchaseReceiptLine_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseReceiptLine" ADD CONSTRAINT "PurchaseReceiptLine_receiptId_tenantId_fkey" FOREIGN KEY ("receiptId", "tenantId") REFERENCES "PurchaseReceipt"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PurchaseReceiptLine" ADD CONSTRAINT "PurchaseReceiptLine_itemId_tenantId_fkey" FOREIGN KEY ("itemId", "tenantId") REFERENCES "InventoryItem"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseReceiptLine" ADD CONSTRAINT "PurchaseReceiptLine_unitId_tenantId_fkey" FOREIGN KEY ("unitId", "tenantId") REFERENCES "InventoryUnit"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
