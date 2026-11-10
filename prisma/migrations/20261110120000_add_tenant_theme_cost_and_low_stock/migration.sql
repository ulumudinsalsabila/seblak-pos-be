-- Add tenant-scoped visual branding without removing the existing outlet receipt branding.
CREATE TABLE "TenantTheme" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "primaryColor" VARCHAR(7) NOT NULL DEFAULT '#C2410C',
    "logoUrl" VARCHAR(500),
    "faviconUrl" VARCHAR(500),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "TenantTheme_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TenantTheme_tenantId_key" ON "TenantTheme"("tenantId");
ALTER TABLE "TenantTheme" ADD CONSTRAINT "TenantTheme_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- New default brand colour (owner decision 2026-11-10). Outlets still on a
-- previous default (never customised) move to it; custom colours are kept.
ALTER TABLE "StoreSettings" ALTER COLUMN "primaryColor" SET DEFAULT '#C2410C';
UPDATE "StoreSettings"
SET "primaryColor" = '#C2410C'
WHERE UPPER("primaryColor") IN ('#0B63F6', '#4F46E5');

-- Carry existing branding over so tenants keep their logo and colour: use the
-- settings of each tenant's oldest outlet.
INSERT INTO "TenantTheme" ("id", "tenantId", "primaryColor", "logoUrl", "faviconUrl", "updatedAt")
SELECT gen_random_uuid(), source."tenantId", source."primaryColor", source."logoUrl", source."faviconUrl", CURRENT_TIMESTAMP
FROM (
  SELECT DISTINCT ON (o."tenantId")
         o."tenantId", s."primaryColor", s."logoUrl", s."faviconUrl"
  FROM "Outlet" o
  JOIN "StoreSettings" s ON s."outletId" = o."id"
  ORDER BY o."tenantId", o."createdAt" ASC
) AS source;

ALTER TABLE "Product" ADD COLUMN "unitCost" INTEGER;
ALTER TABLE "Product" ADD COLUMN "lowStockThreshold" INTEGER;
ALTER TABLE "TransactionItem" ADD COLUMN "unitCost" INTEGER;
ALTER TABLE "TransactionItem" ADD COLUMN "costSubtotal" INTEGER;

ALTER TABLE "Product" ADD CONSTRAINT "Product_unitCost_nonnegative"
  CHECK ("unitCost" IS NULL OR "unitCost" >= 0);
ALTER TABLE "Product" ADD CONSTRAINT "Product_lowStockThreshold_nonnegative"
  CHECK ("lowStockThreshold" IS NULL OR "lowStockThreshold" >= 0);
ALTER TABLE "TransactionItem" ADD CONSTRAINT "TransactionItem_unitCost_nonnegative"
  CHECK ("unitCost" IS NULL OR "unitCost" >= 0);
ALTER TABLE "TransactionItem" ADD CONSTRAINT "TransactionItem_costSubtotal_nonnegative"
  CHECK ("costSubtotal" IS NULL OR "costSubtotal" >= 0);
