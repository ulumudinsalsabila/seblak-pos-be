ALTER TABLE "StoreSettings" ADD COLUMN "menuOptions" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "TransactionItem" ADD COLUMN "selectedOptions" JSONB;
