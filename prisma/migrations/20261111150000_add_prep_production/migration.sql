-- Additive prep production: semi-finished recipes and production batches that
-- post PREP_ISSUED / PREP_RECEIVED / PREP_REVERSED movements to the existing
-- ledger. No existing table is altered.

-- CreateEnum
CREATE TYPE "PrepBatchStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'VOIDED');

-- AlterEnum
ALTER TYPE "StockMovementType" ADD VALUE 'PREP_REVERSED';

-- AlterEnum
ALTER TYPE "InventoryPermission" ADD VALUE 'POST_INVENTORY_PREP';

-- CreateTable
CREATE TABLE "PrepRecipe" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "outputItemId" UUID NOT NULL,
    "outputQuantity" DECIMAL(20,6) NOT NULL,
    "notes" VARCHAR(500),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PrepRecipe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrepRecipeLine" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "recipeId" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "quantity" DECIMAL(20,6) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrepRecipeLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrepBatch" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "clientRequestId" UUID NOT NULL,
    "outputItemId" UUID NOT NULL,
    "status" "PrepBatchStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "plannedQuantity" DECIMAL(20,6) NOT NULL,
    "actualQuantity" DECIMAL(20,6),
    "inputCost" DECIMAL(20,6),
    "outputUnitCost" DECIMAL(20,8),
    "notes" VARCHAR(500),
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedById" UUID,
    "completedAt" TIMESTAMPTZ(3),
    "completedById" UUID,
    "voidedAt" TIMESTAMPTZ(3),
    "voidedById" UUID,
    "voidReason" VARCHAR(500),
    "voidDisposition" VARCHAR(20),

    CONSTRAINT "PrepBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrepBatchInput" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "batchId" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "quantity" DECIMAL(20,6) NOT NULL,
    "unitCost" DECIMAL(20,8),
    "amount" DECIMAL(20,6),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrepBatchInput_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PrepRecipe_tenantId_outputItemId_key" ON "PrepRecipe"("tenantId", "outputItemId");

-- CreateIndex
CREATE UNIQUE INDEX "PrepRecipe_id_tenantId_key" ON "PrepRecipe"("id", "tenantId");

-- CreateIndex
CREATE INDEX "PrepRecipeLine_tenantId_itemId_idx" ON "PrepRecipeLine"("tenantId", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "PrepRecipeLine_recipeId_itemId_key" ON "PrepRecipeLine"("recipeId", "itemId");

-- CreateIndex
CREATE INDEX "PrepBatch_tenantId_status_startedAt_idx" ON "PrepBatch"("tenantId", "status", "startedAt");

-- CreateIndex
CREATE INDEX "PrepBatch_tenantId_locationId_startedAt_idx" ON "PrepBatch"("tenantId", "locationId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PrepBatch_tenantId_clientRequestId_key" ON "PrepBatch"("tenantId", "clientRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "PrepBatch_id_tenantId_key" ON "PrepBatch"("id", "tenantId");

-- CreateIndex
CREATE INDEX "PrepBatchInput_tenantId_itemId_idx" ON "PrepBatchInput"("tenantId", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "PrepBatchInput_batchId_itemId_key" ON "PrepBatchInput"("batchId", "itemId");

-- AddForeignKey
ALTER TABLE "PrepRecipe" ADD CONSTRAINT "PrepRecipe_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrepRecipe" ADD CONSTRAINT "PrepRecipe_outputItemId_tenantId_fkey" FOREIGN KEY ("outputItemId", "tenantId") REFERENCES "InventoryItem"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrepRecipeLine" ADD CONSTRAINT "PrepRecipeLine_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrepRecipeLine" ADD CONSTRAINT "PrepRecipeLine_recipeId_tenantId_fkey" FOREIGN KEY ("recipeId", "tenantId") REFERENCES "PrepRecipe"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrepRecipeLine" ADD CONSTRAINT "PrepRecipeLine_itemId_tenantId_fkey" FOREIGN KEY ("itemId", "tenantId") REFERENCES "InventoryItem"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrepBatch" ADD CONSTRAINT "PrepBatch_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrepBatch" ADD CONSTRAINT "PrepBatch_locationId_tenantId_fkey" FOREIGN KEY ("locationId", "tenantId") REFERENCES "StockLocation"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrepBatch" ADD CONSTRAINT "PrepBatch_outputItemId_tenantId_fkey" FOREIGN KEY ("outputItemId", "tenantId") REFERENCES "InventoryItem"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrepBatch" ADD CONSTRAINT "PrepBatch_startedById_fkey" FOREIGN KEY ("startedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrepBatch" ADD CONSTRAINT "PrepBatch_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrepBatch" ADD CONSTRAINT "PrepBatch_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrepBatchInput" ADD CONSTRAINT "PrepBatchInput_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrepBatchInput" ADD CONSTRAINT "PrepBatchInput_batchId_tenantId_fkey" FOREIGN KEY ("batchId", "tenantId") REFERENCES "PrepBatch"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrepBatchInput" ADD CONSTRAINT "PrepBatchInput_itemId_tenantId_fkey" FOREIGN KEY ("itemId", "tenantId") REFERENCES "InventoryItem"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "PrepRecipe" ADD CONSTRAINT "PrepRecipe_output_check" CHECK ("outputQuantity" > 0);
ALTER TABLE "PrepRecipeLine" ADD CONSTRAINT "PrepRecipeLine_quantity_check" CHECK ("quantity" > 0);
ALTER TABLE "PrepBatch" ADD CONSTRAINT "PrepBatch_quantity_check" CHECK ("plannedQuantity" > 0 AND ("actualQuantity" IS NULL OR "actualQuantity" > 0));
ALTER TABLE "PrepBatchInput" ADD CONSTRAINT "PrepBatchInput_quantity_check" CHECK ("quantity" > 0);
