ALTER TYPE "InventoryPermission" ADD VALUE 'MANAGE_INVENTORY_RECIPES';

CREATE TYPE "ProductInventoryMode" AS ENUM ('DIRECT', 'RECIPE');

CREATE TABLE "InventoryRecipeVersion" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "notes" VARCHAR(500),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InventoryRecipeVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProductInventoryConfig" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "mode" "ProductInventoryMode" NOT NULL,
    "directItemId" UUID,
    "directQuantity" DECIMAL(20,6),
    "activeRecipeVersionId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "ProductInventoryConfig_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ProductInventoryConfig_mode_fields_check" CHECK (
      ("mode" = 'DIRECT' AND "directItemId" IS NOT NULL AND "directQuantity" > 0 AND "activeRecipeVersionId" IS NULL)
      OR
      ("mode" = 'RECIPE' AND "directItemId" IS NULL AND "directQuantity" IS NULL AND "activeRecipeVersionId" IS NOT NULL)
    )
);

CREATE TABLE "InventoryRecipeLine" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "recipeVersionId" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "quantity" DECIMAL(20,6) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InventoryRecipeLine_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "InventoryRecipeLine_quantity_check" CHECK ("quantity" > 0)
);

CREATE UNIQUE INDEX "InventoryRecipeVersion_productId_version_key" ON "InventoryRecipeVersion"("productId", "version");
CREATE UNIQUE INDEX "InventoryRecipeVersion_id_tenantId_key" ON "InventoryRecipeVersion"("id", "tenantId");
CREATE INDEX "InventoryRecipeVersion_tenantId_productId_createdAt_idx" ON "InventoryRecipeVersion"("tenantId", "productId", "createdAt");
CREATE UNIQUE INDEX "ProductInventoryConfig_productId_key" ON "ProductInventoryConfig"("productId");
CREATE UNIQUE INDEX "ProductInventoryConfig_activeRecipeVersionId_key" ON "ProductInventoryConfig"("activeRecipeVersionId");
CREATE INDEX "ProductInventoryConfig_tenantId_locationId_idx" ON "ProductInventoryConfig"("tenantId", "locationId");
CREATE INDEX "ProductInventoryConfig_tenantId_mode_idx" ON "ProductInventoryConfig"("tenantId", "mode");
CREATE UNIQUE INDEX "InventoryRecipeLine_recipeVersionId_itemId_key" ON "InventoryRecipeLine"("recipeVersionId", "itemId");
CREATE INDEX "InventoryRecipeLine_tenantId_itemId_idx" ON "InventoryRecipeLine"("tenantId", "itemId");

ALTER TABLE "InventoryRecipeVersion" ADD CONSTRAINT "InventoryRecipeVersion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryRecipeVersion" ADD CONSTRAINT "InventoryRecipeVersion_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductInventoryConfig" ADD CONSTRAINT "ProductInventoryConfig_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductInventoryConfig" ADD CONSTRAINT "ProductInventoryConfig_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductInventoryConfig" ADD CONSTRAINT "ProductInventoryConfig_locationId_tenantId_fkey" FOREIGN KEY ("locationId", "tenantId") REFERENCES "StockLocation"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProductInventoryConfig" ADD CONSTRAINT "ProductInventoryConfig_directItemId_tenantId_fkey" FOREIGN KEY ("directItemId", "tenantId") REFERENCES "InventoryItem"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProductInventoryConfig" ADD CONSTRAINT "ProductInventoryConfig_activeRecipeVersionId_fkey" FOREIGN KEY ("activeRecipeVersionId") REFERENCES "InventoryRecipeVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryRecipeLine" ADD CONSTRAINT "InventoryRecipeLine_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryRecipeLine" ADD CONSTRAINT "InventoryRecipeLine_recipeVersionId_tenantId_fkey" FOREIGN KEY ("recipeVersionId", "tenantId") REFERENCES "InventoryRecipeVersion"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryRecipeLine" ADD CONSTRAINT "InventoryRecipeLine_itemId_tenantId_fkey" FOREIGN KEY ("itemId", "tenantId") REFERENCES "InventoryItem"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
