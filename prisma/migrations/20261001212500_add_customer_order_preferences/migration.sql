CREATE TYPE "OrderType" AS ENUM ('DINE_IN', 'TAKEAWAY');
CREATE TYPE "BrothLevel" AS ENUM ('LITTLE', 'MEDIUM', 'MUCH');
CREATE TYPE "TastePreference" AS ENUM ('SALTY', 'SAVORY', 'SWEET');

ALTER TABLE "Transaction"
ADD COLUMN "customerName" VARCHAR(100) NOT NULL DEFAULT 'Pelanggan',
ADD COLUMN "orderType" "OrderType" NOT NULL DEFAULT 'DINE_IN',
ADD COLUMN "brothLevel" "BrothLevel" NOT NULL DEFAULT 'MEDIUM',
ADD COLUMN "tastePreference" "TastePreference" NOT NULL DEFAULT 'SAVORY';
