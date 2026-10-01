import { Prisma, PrismaClient, PricingType, Role, UserStatus } from '@prisma/client';
import { hash } from 'bcryptjs';

const prisma = new PrismaClient();

const wait = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function main() {
  const email = (process.env.SEED_OWNER_EMAIL ?? 'owner@mail.com').toLowerCase();
  const password = process.env.SEED_OWNER_PASSWORD ?? '12345678';
  const passwordHash = await hash(password, 10);
  await prisma.user.upsert({
    where: { email },
    create: { name: 'Owner', email, passwordHash, role: Role.OWNER, status: UserStatus.ACTIVE },
    update: { name: 'Owner', passwordHash, role: Role.OWNER, status: UserStatus.ACTIVE },
  });
  await prisma.storeSettings.upsert({
    where: { id: 'default' },
    create: { id: 'default', storeName: 'Saung Sunja', receiptFooter: 'Terima kasih sudah mampir!' },
    update: { storeName: 'Saung Sunja' },
  });
  const category = await prisma.category.upsert({
    where: { id: '00000000-0000-4000-8000-000000000001' },
    create: { id: '00000000-0000-4000-8000-000000000001', name: 'Paket Seblak', sortOrder: 1 },
    update: {},
  });
  await prisma.product.upsert({
    where: { sku: 'SBL-ORIGINAL' },
    create: { categoryId: category.id, name: 'Seblak Original', sku: 'SBL-ORIGINAL', pricingType: PricingType.FIXED, price: 15000, trackStock: false },
    update: {},
  });
}

async function seedWithRetry() {
  const maximumAttempts = 5;
  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    try {
      await main();
      return;
    } catch (error) {
      const isConnectionError =
        error instanceof Prisma.PrismaClientInitializationError &&
        (error.errorCode === 'P1001' ||
          error.message.includes("Can't reach database server"));
      if (!isConnectionError || attempt === maximumAttempts) throw error;
      const delay = attempt * 3_000;
      console.warn(
        `Database belum siap (percobaan ${attempt}/${maximumAttempts}), retry dalam ${delay / 1000} detik...`,
      );
      await wait(delay);
    }
  }
}

seedWithRetry().finally(() => prisma.$disconnect());
