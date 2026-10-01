ALTER TABLE "StoreSettings"
ALTER COLUMN "storeName" SET DEFAULT 'Saung Sunja';

UPDATE "StoreSettings"
SET "storeName" = 'Saung Sunja'
WHERE "storeName" = 'Seblak Prasmanan';
