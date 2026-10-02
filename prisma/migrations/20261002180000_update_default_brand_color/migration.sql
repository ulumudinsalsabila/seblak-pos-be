ALTER TABLE "StoreSettings"
ALTER COLUMN "primaryColor" SET DEFAULT '#4F46E5';

UPDATE "StoreSettings"
SET "primaryColor" = '#4F46E5'
WHERE UPPER("primaryColor") = '#0B63F6';
