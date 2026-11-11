import { UnprocessableEntityException } from '@nestjs/common';
import { Prisma, StockMovementType, UnitDimension } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryLedgerService } from './inventory-ledger.service';
import { PurchaseReceiptsService } from './purchase-receipts.service';

const decimal = (value: string | number) => new Prisma.Decimal(value);
const gram = {
  id: 'unit-g',
  name: 'Gram',
  dimension: UnitDimension.MASS,
  factorToDimensionBase: decimal(1),
};
const kilogram = {
  id: 'unit-kg',
  name: 'Kilogram',
  dimension: UnitDimension.MASS,
  factorToDimensionBase: decimal(1000),
};
const piece = {
  id: 'unit-pcs',
  name: 'Pcs',
  dimension: UnitDimension.COUNT,
  factorToDimensionBase: decimal(1),
};
const dto = {
  clientRequestId: 'request-id',
  locationId: 'location-id',
  supplierName: ' Pasar Induk ',
  lines: [
    { itemId: 'chili', unitId: 'unit-kg', quantity: '2', unitPrice: '40000' },
  ],
};

function setup(options: { replay?: object; units?: object[] } = {}) {
  const post = jest.fn();
  const create = jest.fn().mockResolvedValue({
    id: 'receipt-id',
    supplierName: 'Pasar Induk',
  });
  const tx = {
    purchaseReceipt: {
      findUnique: jest.fn().mockResolvedValue(options.replay ?? null),
      create,
      findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'receipt-id' }),
    },
    stockLocation: {
      findFirst: jest.fn().mockResolvedValue({ id: 'location-id' }),
    },
    inventoryItem: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ id: 'chili', name: 'Cabai', baseUnit: gram }]),
    },
    inventoryUnit: {
      findMany: jest.fn().mockResolvedValue(options.units ?? [kilogram]),
    },
    itemUnitConversion: { findMany: jest.fn().mockResolvedValue([]) },
    inventoryAuditEvent: { create: jest.fn() },
  };
  const prisma = {
    $transaction: (run: (client: typeof tx) => unknown) => run(tx),
  } as unknown as PrismaService;
  const service = new PurchaseReceiptsService(prisma, {
    post,
  } as unknown as InventoryLedgerService);
  return { service, post, create };
}

describe('PurchaseReceiptsService.create', () => {
  it('posts received stock in base units with weighted-average costing', async () => {
    const { service, post, create } = setup();

    await service.create('tenant-id', 'user-id', dto);

    const receipt = create.mock.calls[0][0].data;
    expect(receipt.supplierName).toBe('Pasar Induk');
    expect(receipt.totalAmount.toString()).toBe('80000');
    expect(post).toHaveBeenCalledTimes(1);
    const movement = post.mock.calls[0][1];
    expect(movement).toMatchObject({
      tenantId: 'tenant-id',
      locationId: 'location-id',
      itemId: 'chili',
      type: StockMovementType.PURCHASE_RECEIVED,
      incomingCostPolicy: 'WEIGHTED_AVERAGE',
      sourceType: 'PURCHASE_RECEIPT',
      sourceId: 'receipt-id',
      idempotencyKey: 'purchase:receipt-id:chili',
    });
    expect(movement.quantity.toString()).toBe('2000');
    expect(movement.unitCost.toString()).toBe('40');
  });

  it('returns the original receipt for a repeated request without posting', async () => {
    const replay = { id: 'receipt-id' };
    const { service, post, create } = setup({ replay });

    await expect(service.create('tenant-id', 'user-id', dto)).resolves.toBe(
      replay,
    );
    expect(create).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  });

  it('rejects a unit that cannot be converted to the base unit', async () => {
    const { service, post } = setup({ units: [piece] });

    await expect(
      service.create('tenant-id', 'user-id', {
        ...dto,
        lines: [{ ...dto.lines[0], unitId: 'unit-pcs' }],
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(post).not.toHaveBeenCalled();
  });

  it('rejects the same item twice', async () => {
    const { service } = setup();

    await expect(
      service.create('tenant-id', 'user-id', {
        ...dto,
        lines: [dto.lines[0], dto.lines[0]],
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });
});
