import { UnprocessableEntityException } from '@nestjs/common';
import {
  Prisma,
  StockAdjustmentKind,
  StockAdjustmentReason,
  StockMovementDirection,
  StockMovementType,
  UnitDimension,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryLedgerService } from './inventory-ledger.service';
import { StockAdjustmentsService } from './stock-adjustments.service';

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
const wasteDto = {
  clientRequestId: 'request-id',
  locationId: 'location-id',
  reason: StockAdjustmentReason.SPOILED,
  lines: [{ itemId: 'chili', unitId: 'unit-kg', quantity: '0.5' }],
};

function setup(options: { replay?: object } = {}) {
  const post = jest.fn().mockImplementation((_tx, movement) => ({
    unitCost: movement.direction === 'OUT' ? decimal(40) : movement.unitCost,
    amount: decimal(movement.quantity).mul(40),
  }));
  const lineCreate = jest.fn();
  const update = jest.fn();
  const tx = {
    stockAdjustment: {
      findUnique: jest.fn().mockResolvedValue(options.replay ?? null),
      create: jest.fn().mockResolvedValue({ id: 'adjustment-id' }),
      update,
      findUniqueOrThrow: jest
        .fn()
        .mockResolvedValue({ id: 'adjustment-id', lines: [] }),
    },
    stockAdjustmentLine: { create: lineCreate },
    stockLocation: {
      findFirst: jest.fn().mockResolvedValue({ id: 'location-id' }),
    },
    stockBalance: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ itemId: 'chili', averageUnitCost: decimal(40) }]),
    },
    inventoryItem: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ id: 'chili', name: 'Cabai', baseUnit: gram }]),
    },
    inventoryUnit: { findMany: jest.fn().mockResolvedValue([kilogram, gram]) },
    itemUnitConversion: { findMany: jest.fn().mockResolvedValue([]) },
    inventoryAuditEvent: { create: jest.fn() },
  };
  const prisma = {
    $transaction: (run: (client: typeof tx) => unknown) => run(tx),
  } as unknown as PrismaService;
  const service = new StockAdjustmentsService(prisma, {
    post,
  } as unknown as InventoryLedgerService);
  return { service, post, lineCreate, update };
}

describe('StockAdjustmentsService.create', () => {
  it('posts waste as an OUT movement in base units and records its value', async () => {
    const { service, post, lineCreate, update } = setup();

    await service.create(
      'tenant-id',
      'user-id',
      StockAdjustmentKind.WASTE,
      wasteDto,
      true,
    );

    expect(post).toHaveBeenCalledTimes(1);
    const movement = post.mock.calls[0][1];
    expect(movement).toMatchObject({
      type: StockMovementType.WASTE_POSTED,
      direction: StockMovementDirection.OUT,
      sourceType: 'STOCK_ADJUSTMENT',
      sourceId: 'adjustment-id',
      idempotencyKey: 'waste:adjustment-id:chili',
    });
    expect(movement.quantity.toString()).toBe('500');
    expect(lineCreate.mock.calls[0][0].data.amount.toString()).toBe('20000');
    expect(update.mock.calls[0][0].data.totalAmount.toString()).toBe('-20000');
  });

  it('brings found stock in at the current average without changing it', async () => {
    const { service, post } = setup();

    await service.create(
      'tenant-id',
      'user-id',
      StockAdjustmentKind.ADJUSTMENT,
      {
        ...wasteDto,
        reason: StockAdjustmentReason.FOUND,
        notes: 'Satu pack terselip di rak bawah',
        lines: [
          {
            itemId: 'chili',
            unitId: 'unit-g',
            quantity: '250',
            direction: StockMovementDirection.IN,
          },
        ],
      },
      true,
    );

    expect(post.mock.calls[0][1]).toMatchObject({
      type: StockMovementType.ADJUSTMENT_POSTED,
      direction: StockMovementDirection.IN,
      unitCost: decimal(40),
      incomingCostPolicy: 'PRESERVE',
    });
  });

  it('returns the original document for a repeated request without posting', async () => {
    const replay = {
      id: 'adjustment-id',
      kind: StockAdjustmentKind.WASTE,
      lines: [],
    };
    const { service, post } = setup({ replay });

    await expect(
      service.create(
        'tenant-id',
        'user-id',
        StockAdjustmentKind.WASTE,
        wasteDto,
        true,
      ),
    ).resolves.toEqual(replay);
    expect(post).not.toHaveBeenCalled();
  });

  it.each([
    [
      'a reason that does not fit the kind',
      StockAdjustmentKind.WASTE,
      { ...wasteDto, reason: StockAdjustmentReason.FOUND },
    ],
    [
      'an adjustment without notes',
      StockAdjustmentKind.ADJUSTMENT,
      {
        ...wasteDto,
        reason: StockAdjustmentReason.COUNT_CORRECTION,
        lines: [
          { ...wasteDto.lines[0], direction: StockMovementDirection.OUT },
        ],
      },
    ],
    [
      'an adjustment line without a direction',
      StockAdjustmentKind.ADJUSTMENT,
      {
        ...wasteDto,
        reason: StockAdjustmentReason.COUNT_CORRECTION,
        notes: 'Koreksi salah input',
      },
    ],
    [
      'waste that adds stock',
      StockAdjustmentKind.WASTE,
      {
        ...wasteDto,
        lines: [{ ...wasteDto.lines[0], direction: StockMovementDirection.IN }],
      },
    ],
    [
      'the same item twice',
      StockAdjustmentKind.WASTE,
      { ...wasteDto, lines: [wasteDto.lines[0], wasteDto.lines[0]] },
    ],
  ])('rejects %s', async (_label, kind, dto) => {
    const { service, post } = setup();

    await expect(
      service.create('tenant-id', 'user-id', kind, dto, true),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(post).not.toHaveBeenCalled();
  });
});
