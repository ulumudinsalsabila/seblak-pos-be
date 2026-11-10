-- Additive hybrid inventory foundation. This migration intentionally does not
-- change Product.stock or the current checkout path.

CREATE TYPE "InventoryItemType" AS ENUM ('INGREDIENT', 'SEMI_FINISHED', 'PACKAGED');
CREATE TYPE "UnitDimension" AS ENUM ('MASS', 'VOLUME', 'COUNT');
CREATE TYPE "UnitConversionMode" AS ENUM ('SAME_DIMENSION', 'PACKAGING', 'DENSITY');
CREATE TYPE "StockLocationType" AS ENUM ('WAREHOUSE', 'OUTLET', 'KITCHEN', 'OTHER');
CREATE TYPE "StockMovementDirection" AS ENUM ('IN', 'OUT');
CREATE TYPE "StockMovementType" AS ENUM (
  'OPENING_BALANCE',
  'PURCHASE_RECEIVED',
  'SALE_CONSUMED',
  'SALE_REVERSED',
  'PREP_ISSUED',
  'PREP_RECEIVED',
  'TRANSFER_SHIPPED',
  'TRANSFER_RECEIVED',
  'WASTE_POSTED',
  'ADJUSTMENT_POSTED',
  'STOCKTAKE_VARIANCE_POSTED'
);
CREATE TYPE "InventoryPermission" AS ENUM (
  'VIEW_INVENTORY',
  'VIEW_INVENTORY_COST',
  'VIEW_INVENTORY_LEDGER',
  'MANAGE_INVENTORY_ITEMS',
  'MANAGE_INVENTORY_LOCATIONS',
  'POST_INVENTORY_OPENING'
);

CREATE TABLE "InventoryUnit" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "code" VARCHAR(30) NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "symbol" VARCHAR(20) NOT NULL,
  "dimension" "UnitDimension" NOT NULL,
  "isBase" BOOLEAN NOT NULL DEFAULT false,
  "factorToDimensionBase" DECIMAL(20,9) NOT NULL DEFAULT 1,
  "precision" INTEGER NOT NULL DEFAULT 3,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "InventoryUnit_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InventoryUnit_factor_check" CHECK ("factorToDimensionBase" > 0),
  CONSTRAINT "InventoryUnit_base_factor_check" CHECK (NOT "isBase" OR "factorToDimensionBase" = 1),
  CONSTRAINT "InventoryUnit_precision_check" CHECK ("precision" BETWEEN 0 AND 6)
);

CREATE TABLE "InventoryItem" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "sku" VARCHAR(50) NOT NULL,
  "name" VARCHAR(150) NOT NULL,
  "type" "InventoryItemType" NOT NULL,
  "baseUnitId" UUID NOT NULL,
  "reorderPoint" DECIMAL(20,6) NOT NULL DEFAULT 0,
  "allowNegative" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InventoryItem_reorder_check" CHECK ("reorderPoint" >= 0),
  CONSTRAINT "InventoryItem_negative_disabled_check" CHECK ("allowNegative" = false)
);

CREATE TABLE "ItemUnitConversion" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "itemId" UUID NOT NULL,
  "unitId" UUID NOT NULL,
  "mode" "UnitConversionMode" NOT NULL DEFAULT 'SAME_DIMENSION',
  "factorToBase" DECIMAL(20,9) NOT NULL,
  "density" DECIMAL(20,9),
  "notes" VARCHAR(500),
  "validFrom" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "validTo" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "ItemUnitConversion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ItemUnitConversion_factor_check" CHECK ("factorToBase" > 0),
  CONSTRAINT "ItemUnitConversion_density_check" CHECK ("density" IS NULL OR "density" > 0),
  CONSTRAINT "ItemUnitConversion_validity_check" CHECK ("validTo" IS NULL OR "validTo" >= "validFrom"),
  CONSTRAINT "ItemUnitConversion_documented_cross_check" CHECK ("mode" = 'SAME_DIMENSION' OR length(trim("notes")) >= 3)
);

CREATE TABLE "StockLocation" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "outletId" UUID,
  "code" VARCHAR(50) NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "type" "StockLocationType" NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "StockLocation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StockLocation_outlet_required_check" CHECK ("type" NOT IN ('OUTLET', 'KITCHEN') OR "outletId" IS NOT NULL)
);

CREATE TABLE "StockBalance" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "locationId" UUID NOT NULL,
  "itemId" UUID NOT NULL,
  "quantity" DECIMAL(20,6) NOT NULL DEFAULT 0,
  "reservedQuantity" DECIMAL(20,6) NOT NULL DEFAULT 0,
  "averageUnitCost" DECIMAL(20,8),
  "version" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "StockBalance_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StockBalance_quantity_check" CHECK ("quantity" >= 0),
  CONSTRAINT "StockBalance_reserved_check" CHECK ("reservedQuantity" >= 0 AND "reservedQuantity" <= "quantity"),
  CONSTRAINT "StockBalance_cost_check" CHECK ("averageUnitCost" IS NULL OR "averageUnitCost" >= 0)
);

CREATE TABLE "StockMovement" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "locationId" UUID NOT NULL,
  "itemId" UUID NOT NULL,
  "type" "StockMovementType" NOT NULL,
  "direction" "StockMovementDirection" NOT NULL,
  "quantity" DECIMAL(20,6) NOT NULL,
  "unitCost" DECIMAL(20,8),
  "amount" DECIMAL(20,6),
  "balanceAfter" DECIMAL(20,6) NOT NULL,
  "sourceType" VARCHAR(50) NOT NULL,
  "sourceId" VARCHAR(100),
  "idempotencyKey" VARCHAR(150) NOT NULL,
  "notes" VARCHAR(500),
  "actorId" UUID,
  "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StockMovement_quantity_check" CHECK ("quantity" > 0),
  CONSTRAINT "StockMovement_cost_check" CHECK ("unitCost" IS NULL OR "unitCost" >= 0),
  CONSTRAINT "StockMovement_amount_check" CHECK ("amount" IS NULL OR "amount" >= 0),
  CONSTRAINT "StockMovement_balance_check" CHECK ("balanceAfter" >= 0)
);

CREATE TABLE "InventoryPermissionGrant" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "locationId" UUID,
  "scopeKey" VARCHAR(50) NOT NULL DEFAULT 'TENANT',
  "permission" "InventoryPermission" NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryPermissionGrant_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InventoryPermissionGrant_scope_check" CHECK (
    ("locationId" IS NULL AND "scopeKey" = 'TENANT') OR
    ("locationId" IS NOT NULL AND "scopeKey" = "locationId"::text)
  )
);

CREATE TABLE "InventoryAuditEvent" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "actorId" UUID,
  "action" VARCHAR(80) NOT NULL,
  "entityType" VARCHAR(80) NOT NULL,
  "entityId" VARCHAR(100) NOT NULL,
  "payload" JSONB,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryAuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InventoryUnit_tenantId_code_key" ON "InventoryUnit"("tenantId", "code");
CREATE UNIQUE INDEX "InventoryUnit_id_tenantId_key" ON "InventoryUnit"("id", "tenantId");
CREATE UNIQUE INDEX "InventoryUnit_one_base_per_dimension_key" ON "InventoryUnit"("tenantId", "dimension") WHERE "isBase" = true;
CREATE INDEX "InventoryUnit_tenantId_dimension_isActive_idx" ON "InventoryUnit"("tenantId", "dimension", "isActive");
CREATE UNIQUE INDEX "InventoryItem_tenantId_sku_key" ON "InventoryItem"("tenantId", "sku");
CREATE UNIQUE INDEX "InventoryItem_id_tenantId_key" ON "InventoryItem"("id", "tenantId");
CREATE INDEX "InventoryItem_tenantId_type_isActive_idx" ON "InventoryItem"("tenantId", "type", "isActive");
CREATE INDEX "InventoryItem_tenantId_name_idx" ON "InventoryItem"("tenantId", "name");
CREATE UNIQUE INDEX "ItemUnitConversion_itemId_unitId_validFrom_key" ON "ItemUnitConversion"("itemId", "unitId", "validFrom");
CREATE INDEX "ItemUnitConversion_tenantId_itemId_validTo_idx" ON "ItemUnitConversion"("tenantId", "itemId", "validTo");
CREATE UNIQUE INDEX "StockLocation_tenantId_code_key" ON "StockLocation"("tenantId", "code");
CREATE UNIQUE INDEX "StockLocation_id_tenantId_key" ON "StockLocation"("id", "tenantId");
CREATE INDEX "StockLocation_tenantId_type_isActive_idx" ON "StockLocation"("tenantId", "type", "isActive");
CREATE INDEX "StockLocation_outletId_isActive_idx" ON "StockLocation"("outletId", "isActive");
CREATE UNIQUE INDEX "StockBalance_tenantId_locationId_itemId_key" ON "StockBalance"("tenantId", "locationId", "itemId");
CREATE INDEX "StockBalance_tenantId_locationId_quantity_idx" ON "StockBalance"("tenantId", "locationId", "quantity");
CREATE INDEX "StockBalance_tenantId_itemId_idx" ON "StockBalance"("tenantId", "itemId");
CREATE UNIQUE INDEX "StockMovement_tenantId_idempotencyKey_key" ON "StockMovement"("tenantId", "idempotencyKey");
CREATE INDEX "StockMovement_tenant_location_item_time_idx" ON "StockMovement"("tenantId", "locationId", "itemId", "occurredAt", "id");
CREATE INDEX "StockMovement_tenantId_sourceType_sourceId_idx" ON "StockMovement"("tenantId", "sourceType", "sourceId");
CREATE INDEX "StockMovement_actorId_occurredAt_idx" ON "StockMovement"("actorId", "occurredAt");
CREATE UNIQUE INDEX "InventoryPermissionGrant_tenant_user_permission_scope_key" ON "InventoryPermissionGrant"("tenantId", "userId", "permission", "scopeKey");
CREATE INDEX "InventoryPermissionGrant_tenantId_permission_idx" ON "InventoryPermissionGrant"("tenantId", "permission");
CREATE INDEX "InventoryPermissionGrant_userId_locationId_idx" ON "InventoryPermissionGrant"("userId", "locationId");
CREATE INDEX "InventoryAuditEvent_tenant_entity_time_idx" ON "InventoryAuditEvent"("tenantId", "entityType", "entityId", "createdAt");
CREATE INDEX "InventoryAuditEvent_tenant_actor_time_idx" ON "InventoryAuditEvent"("tenantId", "actorId", "createdAt");
CREATE UNIQUE INDEX "Outlet_id_tenantId_key" ON "Outlet"("id", "tenantId");

ALTER TABLE "InventoryUnit" ADD CONSTRAINT "InventoryUnit_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_baseUnitId_tenantId_fkey" FOREIGN KEY ("baseUnitId", "tenantId") REFERENCES "InventoryUnit"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ItemUnitConversion" ADD CONSTRAINT "ItemUnitConversion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ItemUnitConversion" ADD CONSTRAINT "ItemUnitConversion_itemId_tenantId_fkey" FOREIGN KEY ("itemId", "tenantId") REFERENCES "InventoryItem"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ItemUnitConversion" ADD CONSTRAINT "ItemUnitConversion_unitId_tenantId_fkey" FOREIGN KEY ("unitId", "tenantId") REFERENCES "InventoryUnit"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockLocation" ADD CONSTRAINT "StockLocation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StockLocation" ADD CONSTRAINT "StockLocation_outletId_tenantId_fkey" FOREIGN KEY ("outletId", "tenantId") REFERENCES "Outlet"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockBalance" ADD CONSTRAINT "StockBalance_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StockBalance" ADD CONSTRAINT "StockBalance_locationId_tenantId_fkey" FOREIGN KEY ("locationId", "tenantId") REFERENCES "StockLocation"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockBalance" ADD CONSTRAINT "StockBalance_itemId_tenantId_fkey" FOREIGN KEY ("itemId", "tenantId") REFERENCES "InventoryItem"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_locationId_tenantId_fkey" FOREIGN KEY ("locationId", "tenantId") REFERENCES "StockLocation"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_itemId_tenantId_fkey" FOREIGN KEY ("itemId", "tenantId") REFERENCES "InventoryItem"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InventoryPermissionGrant" ADD CONSTRAINT "InventoryPermissionGrant_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryPermissionGrant" ADD CONSTRAINT "InventoryPermissionGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryPermissionGrant" ADD CONSTRAINT "InventoryPermissionGrant_locationId_tenantId_fkey" FOREIGN KEY ("locationId", "tenantId") REFERENCES "StockLocation"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryAuditEvent" ADD CONSTRAINT "InventoryAuditEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryAuditEvent" ADD CONSTRAINT "InventoryAuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Canonical units for every existing tenant.
INSERT INTO "InventoryUnit" ("id", "tenantId", "code", "name", "symbol", "dimension", "isBase", "factorToDimensionBase", "precision", "updatedAt")
SELECT gen_random_uuid(), "id", 'g', 'Gram', 'g', 'MASS', true, 1, 3, CURRENT_TIMESTAMP FROM "Tenant";
INSERT INTO "InventoryUnit" ("id", "tenantId", "code", "name", "symbol", "dimension", "isBase", "factorToDimensionBase", "precision", "updatedAt")
SELECT gen_random_uuid(), "id", 'kg', 'Kilogram', 'kg', 'MASS', false, 1000, 3, CURRENT_TIMESTAMP FROM "Tenant";
INSERT INTO "InventoryUnit" ("id", "tenantId", "code", "name", "symbol", "dimension", "isBase", "factorToDimensionBase", "precision", "updatedAt")
SELECT gen_random_uuid(), "id", 'ml', 'Milliliter', 'ml', 'VOLUME', true, 1, 3, CURRENT_TIMESTAMP FROM "Tenant";
INSERT INTO "InventoryUnit" ("id", "tenantId", "code", "name", "symbol", "dimension", "isBase", "factorToDimensionBase", "precision", "updatedAt")
SELECT gen_random_uuid(), "id", 'l', 'Liter', 'L', 'VOLUME', false, 1000, 3, CURRENT_TIMESTAMP FROM "Tenant";
INSERT INTO "InventoryUnit" ("id", "tenantId", "code", "name", "symbol", "dimension", "isBase", "factorToDimensionBase", "precision", "updatedAt")
SELECT gen_random_uuid(), "id", 'pcs', 'Pieces', 'pcs', 'COUNT', true, 1, 0, CURRENT_TIMESTAMP FROM "Tenant";

-- One default stock location for every existing outlet. No Product.stock data
-- is copied yet; opening balance backfill belongs to the next controlled phase.
INSERT INTO "StockLocation" ("id", "tenantId", "outletId", "code", "name", "type", "updatedAt")
SELECT gen_random_uuid(), "tenantId", "id", 'OUTLET-' || "code", "name", 'OUTLET', CURRENT_TIMESTAMP FROM "Outlet";

CREATE FUNCTION prevent_inventory_history_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is immutable', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "StockMovement_immutable"
BEFORE UPDATE OR DELETE ON "StockMovement"
FOR EACH ROW EXECUTE FUNCTION prevent_inventory_history_mutation();

CREATE TRIGGER "InventoryAuditEvent_immutable"
BEFORE UPDATE OR DELETE ON "InventoryAuditEvent"
FOR EACH ROW EXECUTE FUNCTION prevent_inventory_history_mutation();
