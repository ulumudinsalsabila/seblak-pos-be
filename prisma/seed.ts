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
const DEFAULT_TENANT_ID = '10000000-0000-4000-8000-000000000001';
const DEFAULT_OUTLET_ID = '10000000-0000-4000-8000-000000000002';
const seblakCategoryId = masterCategories.find((category) => category.code === 'SEBLAK')!.id;
const DEFAULT_MENU_OPTIONS = [
  { id: 'taste', name: 'Rasa', sortOrder: 1, isActive: true, categoryIds: [seblakCategoryId], values: [
    { id: 'SALTY', label: 'Asin' }, { id: 'SAVORY', label: 'Gurih', isDefault: true }, { id: 'SWEET', label: 'Manis' },
  ] },
  { id: 'spicy', name: 'Level pedas', sortOrder: 2, isActive: true, categoryIds: [seblakCategoryId], values: [0, 1, 2, 3, 4, 5].map((value) => ({ id: String(value), label: String(value), isDefault: value === 0 })) },
  { id: 'broth', name: 'Kuah', sortOrder: 3, isActive: true, categoryIds: [seblakCategoryId], values: [
    { id: 'LITTLE', label: 'Sedikit' }, { id: 'MEDIUM', label: 'Sedang', isDefault: true }, { id: 'MUCH', label: 'Banyak' },
  ] },
];

const wait = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function main() {
  await prisma.tenant.upsert({
    where: { id: DEFAULT_TENANT_ID },
    create: {
      id: DEFAULT_TENANT_ID,
      name: 'Saung Sunja',
      slug: 'saung-sunja',
      outlets: {
        create: {
          id: DEFAULT_OUTLET_ID,
          name: 'Saung Sunja',
          code: 'SUNJA-01',
        },
      },
    },
    update: { name: 'Saung Sunja' },
  });
  const email = (
    process.env.SEED_OWNER_EMAIL ?? 'owner@mail.com'
  ).toLowerCase();
  const password = process.env.SEED_OWNER_PASSWORD ?? '12345678';
  const passwordHash = await hash(password, 10);
  const owner = await prisma.user.upsert({
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
  await prisma.outletMembership.upsert({
    where: { userId_outletId: { userId: owner.id, outletId: DEFAULT_OUTLET_ID } },
    create: {
      userId: owner.id,
      outletId: DEFAULT_OUTLET_ID,
      role: Role.OWNER,
      isDefault: true,
    },
    update: { role: Role.OWNER, isDefault: true },
  });
  await prisma.storeSettings.upsert({
    where: { id: 'default' },
    create: {
      id: 'default',
      outletId: DEFAULT_OUTLET_ID,
      storeName: 'Saung Sunja',
      receiptFooter: 'Terima kasih sudah mampir!',
      menuOptions: DEFAULT_MENU_OPTIONS,
    },
    update: { outletId: DEFAULT_OUTLET_ID, storeName: 'Saung Sunja', menuOptions: DEFAULT_MENU_OPTIONS },
  });
  const categoryIds = new Map<string, string>();

  for (const category of masterCategories) {
    const seededCategory = await prisma.category.upsert({
      where: { id: category.id },
      create: {
        id: category.id,
        outletId: DEFAULT_OUTLET_ID,
        name: category.name,
        sortOrder: category.sortOrder,
        isActive: true,
      },
      update: {
        outletId: DEFAULT_OUTLET_ID,
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
      where: {
        outletId_sku: { outletId: DEFAULT_OUTLET_ID, sku: product.sku },
      },
      create: {
        outletId: DEFAULT_OUTLET_ID,
        categoryId,
        name: product.name,
        sku: product.sku,
        pricingType,
        price: product.price,
        trackStock: false,
        isActive: true,
      },
      update: {
        outletId: DEFAULT_OUTLET_ID,
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
    where: { outletId: DEFAULT_OUTLET_ID, sku: 'SBL-ORIGINAL' },
  });

  const superAdminEmail = process.env.SEED_SUPER_ADMIN_EMAIL?.trim().toLowerCase();
  const superAdminPassword = process.env.SEED_SUPER_ADMIN_PASSWORD;
  if (superAdminEmail && superAdminPassword) {
    await prisma.user.upsert({
      where: { email: superAdminEmail },
      create: {
        name: 'Super Admin',
        email: superAdminEmail,
        passwordHash: await hash(superAdminPassword, 10),
        role: Role.SUPER_ADMIN,
        status: UserStatus.ACTIVE,
      },
      update: {
        passwordHash: await hash(superAdminPassword, 10),
        role: Role.SUPER_ADMIN,
        status: UserStatus.ACTIVE,
      },
    });
  }
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
