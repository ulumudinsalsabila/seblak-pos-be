import { PrismaClient, PricingType, Role, UserStatus } from '@prisma/client';
import { hash } from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email = (process.env.SEED_OWNER_EMAIL ?? 'owner@seblak.local').toLowerCase();
  const password = process.env.SEED_OWNER_PASSWORD ?? 'ChangeMe123!';
  await prisma.user.upsert({
    where: { email },
    create: { name: 'Owner', email, passwordHash: await hash(password, 10), role: Role.OWNER, status: UserStatus.ACTIVE },
    update: {},
  });
  await prisma.storeSettings.upsert({
    where: { id: 'default' },
    create: { id: 'default', storeName: 'Seblak Prasmanan', receiptFooter: 'Terima kasih sudah mampir!' },
    update: {},
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

main().finally(() => prisma.$disconnect());
