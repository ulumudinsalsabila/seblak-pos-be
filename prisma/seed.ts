import {
  Prisma,
  PrismaClient,
  PricingType,
  Role,
  UserStatus,
} from '@prisma/client';
import { hash } from 'bcryptjs';
import { masterCategories, masterProducts } from './master-product.seed';

const prisma = new PrismaClient();

const wait = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function main() {
  const email = (
    process.env.SEED_OWNER_EMAIL ?? 'owner@mail.com'
  ).toLowerCase();
  const password = process.env.SEED_OWNER_PASSWORD ?? '12345678';
  const passwordHash = await hash(password, 10);
  await prisma.user.upsert({
    where: { email },
    create: {
      name: 'Owner',
      email,
      passwordHash,
      role: Role.OWNER,
      status: UserStatus.ACTIVE,
    },
    update: {
      name: 'Owner',
      passwordHash,
      role: Role.OWNER,
      status: UserStatus.ACTIVE,
    },
  });
  await prisma.storeSettings.upsert({
    where: { id: 'default' },
    create: {
      id: 'default',
      storeName: 'Saung Sunja',
      receiptFooter: 'Terima kasih sudah mampir!',
    },
    update: { storeName: 'Saung Sunja' },
  });
  const categoryIds = new Map<string, string>();

  for (const category of masterCategories) {
    const seededCategory = await prisma.category.upsert({
      where: { id: category.id },
      create: {
        id: category.id,
        name: category.name,
        sortOrder: category.sortOrder,
        isActive: true,
      },
      update: {
        name: category.name,
        sortOrder: category.sortOrder,
        isActive: true,
      },
    });

    categoryIds.set(category.code, seededCategory.id);
  }

  for (const product of masterProducts) {
    const categoryId = categoryIds.get(product.category);
    if (!categoryId) {
      throw new Error(
        `Kategori ${product.category} untuk produk ${product.sku} tidak ditemukan.`,
      );
    }

    const pricingType = product.category.startsWith('TOPPING_')
      ? PricingType.PER_ITEM
      : PricingType.FIXED;

    await prisma.product.upsert({
      where: { sku: product.sku },
      create: {
        categoryId,
        name: product.name,
        sku: product.sku,
        pricingType,
        price: product.price,
        trackStock: false,
        isActive: true,
      },
      update: {
        categoryId,
        name: product.name,
        pricingType,
        price: product.price,
        trackStock: false,
        isActive: true,
      },
    });
  }

  await prisma.product.deleteMany({
    where: { sku: 'SBL-ORIGINAL' },
  });
  await prisma.category.deleteMany({
    where: {
      id: '00000000-0000-4000-8000-000000000001',
      products: { none: {} },
    },
  });

  console.log(
    `Seed selesai: ${masterCategories.length} kategori dan ${masterProducts.length} produk aktif.`,
  );
}

async function seedWithRetry() {
  const maximumAttempts = 5;
  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    try {
      await main();
      return;
    } catch (error) {
      const isConnectionError =
        (error instanceof Prisma.PrismaClientInitializationError &&
          (error.errorCode === 'P1001' ||
            error.message.includes("Can't reach database server"))) ||
        (error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P1001');
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
