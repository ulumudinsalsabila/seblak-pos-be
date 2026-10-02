CREATE TYPE "KitchenStatus" AS ENUM ('PENDING', 'COMPLETED');

ALTER TABLE "Transaction"
ADD COLUMN "kitchenStatus" "KitchenStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN "kitchenCompletedAt" TIMESTAMPTZ(3);

ALTER TABLE "TransactionItem"
ADD COLUMN "kitchenStatus" "KitchenStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN "completedAt" TIMESTAMPTZ(3);

-- Existing paid transactions predate the kitchen workflow and must not flood
-- the live queue when this migration is deployed.
UPDATE "Transaction"
SET "kitchenStatus" = 'COMPLETED',
    "kitchenCompletedAt" = "updatedAt";

UPDATE "TransactionItem"
SET "kitchenStatus" = 'COMPLETED',
    "completedAt" = "createdAt";

CREATE INDEX "Transaction_kitchenStatus_createdAt_idx"
ON "Transaction"("kitchenStatus", "createdAt");
