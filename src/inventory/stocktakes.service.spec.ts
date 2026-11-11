import { ConflictException } from '@nestjs/common';
import {
  Prisma,
  StockMovementDirection,
  StockMovementType,
  StocktakeStatus,
  UnitDimension,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryLedgerService } from './inventory-ledger.service';
import { StocktakesService } from './stocktakes.service';

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

function setup(
  options: {
    status?: StocktakeStatus;
    lines?: object[];
    balance?: { quantity: Prisma.Decimal; averageUnitCost: Prisma.Decimal };
  } = {},
) {
  const post = jest.fn().mockImplementation((_tx, movement) => ({
    unitCost: decimal(40),
    amount: decimal(movement.quantity).mul(40),
  }));
  const upsert = jest.fn();
  const lineUpdate = jest.fn();
  const stocktakeUpdate = jest.fn();
  const balance = options.balance ?? {
    quantity: decimal(1200),
    averageUnitCost: decimal(40),
  };
  const tx = {
    $queryRaw: jest.fn(),
    stocktake: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'stocktake-id',
        status: options.status ?? StocktakeStatus.COUNTING,
        locationId: 'location-id',
        lines: [],
      }),
      update: stocktakeUpdate,
    },
    stocktakeLine: {
      upsert,
      update: lineUpdate,
      findMany: jest.fn().mockResolvedValue(options.lines ?? []),
      count: jest.fn().mockResolvedValue((options.lines ?? []).length),
    },
    stockBalance: {
      findMany: jest.fn().mockResolvedValue([{ itemId: 'chili', ...balance }]),
    },
    inventoryItem: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ id: 'chili', name: 'Cabai', baseUnit: gram }]),
    },
    inventoryUnit: { findMany: jest.fn().mockResolvedValue([kilogram]) },
    itemUnitConversion: { findMany: jest.fn().mockResolvedValue([]) },
    inventoryAuditEvent: { create: jest.fn() },
  };
  const prisma = {
    $transaction: (run: (client: typeof tx) => unknown) => run(tx),
    stocktake: tx.stocktake,
  } as unknown as PrismaService;
  const service = new StocktakesService(prisma, {
    post,
  } as unknown as InventoryLedgerService);
  return { service, post, upsert, lineUpdate, stocktakeUpdate };
}

const countLine = (expected: number, counted: number) => ({
  id: 'line-id',
  itemId: 'chili',
  expectedQuantity: decimal(expected),
  countedQuantity: decimal(counted),
  varianceQuantity: decimal(counted - expected),
});

describe('StocktakesService', () => {
  it('records a count in base units against the balance at count time', async () => {
    const { service, upsert } = setup();

    await service.recordCounts(
      'tenant-id',
      'user-id',
      'stocktake-id',
      { lines: [{ itemId: 'chili', unitId: 'unit-kg', quantity: '1.15' }] },
      true,
    );

    const line = upsert.mock.calls[0][0].create;
    expect(line.countedQuantity.toString()).toBe('1150');
    expect(line.expectedQuantity.toString()).toBe('1200');
    expect(line.varianceQuantity.toString()).toBe('-50');
  });

  it('refuses counts once the session is submitted', async () => {
    const { service, upsert } = setup({ status: StocktakeStatus.REVIEW });

    await expect(
      service.recordCounts(
        'tenant-id',
        'user-id',
        'stocktake-id',
        { lines: [{ itemId: 'chili', unitId: 'unit-kg', quantity: '1' }] },
        true,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('posts the variance on approval instead of overwriting the live balance', async () => {
    const { service, post, lineUpdate, stocktakeUpdate } = setup({
      status: StocktakeStatus.REVIEW,
      lines: [countLine(1200, 1150)],
    });

    await service.approve('tenant-id', 'user-id', 'stocktake-id', true);

    expect(post).toHaveBeenCalledTimes(1);
    const movement = post.mock.calls[0][1];
    expect(movement).toMatchObject({
      type: StockMovementType.STOCKTAKE_VARIANCE_POSTED,
      direction: StockMovementDirection.OUT,
      sourceType: 'STOCKTAKE',
      idempotencyKey: 'stocktake:stocktake-id:chili',
    });
    expect(movement.quantity.toString()).toBe('50');
    expect(lineUpdate.mock.calls[0][0].data.varianceAmount.toString()).toBe(
      '-2000',
    );
    expect(stocktakeUpdate.mock.calls[0][0].data).toMatchObject({
      status: StocktakeStatus.POSTED,
      approvedById: 'user-id',
    });
  });

  it('posts nothing for a line whose count matches', async () => {
    const { service, post, lineUpdate } = setup({
      status: StocktakeStatus.REVIEW,
      lines: [countLine(1200, 1200)],
    });

    await service.approve('tenant-id', 'user-id', 'stocktake-id', true);

    expect(post).not.toHaveBeenCalled();
    expect(lineUpdate.mock.calls[0][0].data.varianceAmount.toString()).toBe(
      '0',
    );
  });

  it('refuses to approve a session that is still counting', async () => {
    const { service, post } = setup({
      status: StocktakeStatus.COUNTING,
      lines: [countLine(1200, 1150)],
    });

    await expect(
      service.approve('tenant-id', 'user-id', 'stocktake-id', true),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(post).not.toHaveBeenCalled();
  });

  it('refuses to cancel a posted session', async () => {
    const { service, stocktakeUpdate } = setup({
      status: StocktakeStatus.POSTED,
    });

    await expect(
      service.cancel(
        'tenant-id',
        'user-id',
        'stocktake-id',
        { reason: 'Salah lokasi' },
        true,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(stocktakeUpdate).not.toHaveBeenCalled();
  });
});
