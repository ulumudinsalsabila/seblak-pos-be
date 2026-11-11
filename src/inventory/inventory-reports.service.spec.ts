import { UnprocessableEntityException } from '@nestjs/common';
import {
  Prisma,
  StockMovementDirection,
  StockMovementType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryReportsService } from './inventory-reports.service';

const decimal = (value: string | number) => new Prisma.Decimal(value);
const group = (
  type: StockMovementType,
  direction: StockMovementDirection,
  quantity: number,
  amount: number,
) => ({
  itemId: 'chili',
  type,
  direction,
  _sum: { quantity: decimal(quantity), amount: decimal(amount) },
});

function setup(uncosted = 0) {
  const prisma = {
    transaction: {
      aggregate: jest.fn().mockResolvedValue({
        _sum: { subtotal: 130000, discount: 10000 },
        _count: 8,
      }),
    },
    stockMovement: {
      groupBy: jest
        .fn()
        .mockResolvedValue([
          group(
            StockMovementType.SALE_CONSUMED,
            StockMovementDirection.OUT,
            900,
            36000,
          ),
          group(
            StockMovementType.WASTE_POSTED,
            StockMovementDirection.OUT,
            50,
            2000,
          ),
        ]),
      count: jest.fn().mockResolvedValue(uncosted),
    },
    purchaseReceipt: {
      aggregate: jest.fn().mockResolvedValue({
        _sum: { totalAmount: decimal(80000) },
        _count: 1,
      }),
    },
    prepBatch: {
      findMany: jest.fn().mockResolvedValue([
        {
          plannedQuantity: decimal(1000),
          actualQuantity: decimal(850),
          outputUnitCost: decimal('47.05882353'),
        },
      ]),
    },
    stockTransfer: {
      findMany: jest
        .fn()
        .mockResolvedValue([
          { lines: [{ lostQuantity: decimal(25), unitCost: decimal(40) }] },
        ]),
    },
    inventoryItem: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'chili',
          name: 'Cabai',
          sku: 'CBI',
          type: 'INGREDIENT',
          baseUnit: { symbol: 'g', precision: 0 },
        },
      ]),
    },
  };
  return {
    service: new InventoryReportsService(prisma as unknown as PrismaService),
    prisma,
  };
}

const period = {
  dateFrom: '2026-11-01T00:00:00.000Z',
  dateTo: '2026-11-30T23:59:59.999Z',
};

describe('InventoryReportsService.foodCost', () => {
  it('compares theoretical and actual cost against net sales', async () => {
    const { service } = setup();

    const report = await service.foodCost('tenant-id', period);

    expect(report.revenue.toString()).toBe('120000');
    expect(report.theoreticalCost.toString()).toBe('36000');
    // 36000 sales + 2000 waste + 25 g lost in transit at Rp40.
    expect(report.actualCost.toString()).toBe('39000');
    expect(report.theoreticalFoodCostPercent?.toString()).toBe('30');
    expect(report.actualFoodCostPercent?.toString()).toBe('32.5');
    expect(report.purchaseSpend.toString()).toBe('80000');
    expect(report.prep.yieldPercent?.toString()).toBe('85');
    expect(report.items[0]).toMatchObject({
      itemId: 'chili',
      item: { name: 'Cabai' },
    });
    expect(report.items[0].lossCost.toString()).toBe('2000');
    expect(report.costCoverage.complete).toBe(true);
  });

  it('flags movements posted without a cost instead of guessing them', async () => {
    const { service } = setup(3);

    const report = await service.foodCost('tenant-id', period);

    expect(report.costCoverage).toEqual({
      uncostedMovements: 3,
      complete: false,
    });
  });

  it('scopes every source to the chosen outlet', async () => {
    const { service, prisma } = setup();

    await service.foodCost('tenant-id', { ...period, outletId: 'outlet-id' });

    expect(prisma.transaction.aggregate.mock.calls[0][0].where.outletId).toBe(
      'outlet-id',
    );
    expect(
      prisma.stockMovement.groupBy.mock.calls[0][0].where.location,
    ).toEqual({ outletId: 'outlet-id' });
  });

  it('rejects an inverted period', async () => {
    const { service } = setup();

    await expect(
      service.foodCost('tenant-id', {
        dateFrom: period.dateTo,
        dateTo: period.dateFrom,
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });
});
