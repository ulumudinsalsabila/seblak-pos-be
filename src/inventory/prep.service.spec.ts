import {
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  InventoryItemType,
  PrepBatchStatus,
  Prisma,
  StockAdjustmentReason,
  StockMovementDirection,
  StockMovementType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryLedgerService } from './inventory-ledger.service';
import { PrepService } from './prep.service';
import { StockAdjustmentsService } from './stock-adjustments.service';

const decimal = (value: string | number) => new Prisma.Decimal(value);
const startDto = {
  clientRequestId: 'request-id',
  locationId: 'kitchen',
  outputItemId: 'sambal',
  plannedQuantity: '900',
  lines: [{ itemId: 'chili', quantity: '1000' }],
};

function setup(
  options: { outputType?: InventoryItemType; status?: PrepBatchStatus } = {},
) {
  const post = jest.fn().mockImplementation((_tx, movement) => ({
    unitCost: decimal(40),
    amount: decimal(movement.quantity).mul(40),
  }));
  const recordConsumedAsWaste = jest.fn();
  const batchUpdate = jest.fn();
  const inputCreate = jest.fn();
  const issued = [
    {
      id: 'issue-move',
      locationId: 'kitchen',
      itemId: 'chili',
      quantity: decimal(1000),
      unitCost: decimal(40),
    },
  ];
  const tx = {
    $queryRaw: jest.fn(),
    stockLocation: {
      findFirst: jest.fn().mockResolvedValue({ id: 'kitchen' }),
    },
    prepBatch: {
      create: jest.fn().mockResolvedValue({ id: 'batch-id' }),
      findFirst: jest.fn().mockResolvedValue({
        status: options.status ?? PrepBatchStatus.IN_PROGRESS,
        locationId: 'kitchen',
        outputItemId: 'sambal',
        plannedQuantity: decimal(900),
      }),
      findUniqueOrThrow: jest
        .fn()
        .mockResolvedValue({ id: 'batch-id', inputs: [] }),
      update: batchUpdate,
    },
    prepBatchInput: {
      create: inputCreate,
      findMany: jest.fn().mockResolvedValue([{ amount: decimal(40000) }]),
    },
    stockMovement: { findMany: jest.fn().mockResolvedValue(issued) },
    inventoryAuditEvent: { create: jest.fn() },
  };
  const prisma = {
    $transaction: (run: (client: typeof tx) => unknown) => run(tx),
    prepBatch: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue({ id: 'batch-id', inputs: [] }),
    },
    inventoryItem: {
      findFirst: jest.fn().mockResolvedValue({
        type: options.outputType ?? InventoryItemType.SEMI_FINISHED,
      }),
      count: jest.fn().mockResolvedValue(1),
    },
  } as unknown as PrismaService;
  const service = new PrepService(
    prisma,
    { post } as unknown as InventoryLedgerService,
    { recordConsumedAsWaste } as unknown as StockAdjustmentsService,
  );
  return {
    service,
    post,
    recordConsumedAsWaste,
    batchUpdate,
    inputCreate,
    issued,
  };
}

describe('PrepService', () => {
  it('issues inputs from stock when a batch starts', async () => {
    const { service, post, inputCreate } = setup();

    await service.start('tenant-id', 'user-id', startDto, true);

    expect(post.mock.calls[0][1]).toMatchObject({
      type: StockMovementType.PREP_ISSUED,
      direction: StockMovementDirection.OUT,
      sourceType: 'PREP_BATCH',
      idempotencyKey: 'prep-issue:batch-id:chili',
    });
    expect(inputCreate.mock.calls[0][0].data.amount.toString()).toBe('40000');
  });

  it('only produces semi-finished items', async () => {
    const { service, post } = setup({
      outputType: InventoryItemType.INGREDIENT,
    });

    await expect(
      service.start('tenant-id', 'user-id', startDto, true),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(post).not.toHaveBeenCalled();
  });

  it('refuses an output that is also an input', async () => {
    const { service } = setup();

    await expect(
      service.start(
        'tenant-id',
        'user-id',
        { ...startDto, lines: [{ itemId: 'sambal', quantity: '10' }] },
        true,
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('receives the actual output carrying the whole input cost', async () => {
    const { service, post, batchUpdate } = setup();

    await service.complete(
      'tenant-id',
      'user-id',
      'batch-id',
      { actualQuantity: '850' },
      true,
    );

    const output = post.mock.calls[0][1];
    expect(output).toMatchObject({
      type: StockMovementType.PREP_RECEIVED,
      direction: StockMovementDirection.IN,
      itemId: 'sambal',
      incomingCostPolicy: 'WEIGHTED_AVERAGE',
      idempotencyKey: 'prep-output:batch-id',
    });
    expect(output.quantity.toString()).toBe('850');
    expect(output.unitCost.toString()).toBe('47.05882353');
    expect(batchUpdate.mock.calls[0][0].data).toMatchObject({
      status: PrepBatchStatus.COMPLETED,
    });
  });

  it('refuses to complete a batch twice', async () => {
    const { service, post } = setup({ status: PrepBatchStatus.COMPLETED });

    await expect(
      service.complete(
        'tenant-id',
        'user-id',
        'batch-id',
        { actualQuantity: '850' },
        true,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(post).not.toHaveBeenCalled();
  });

  it('returns inputs to stock when voided as a mistake', async () => {
    const { service, post, recordConsumedAsWaste } = setup();

    await service.void(
      'tenant-id',
      'user-id',
      'batch-id',
      { reason: 'Salah pilih resep', disposition: 'RESTOCK' },
      true,
    );

    expect(post.mock.calls[0][1]).toMatchObject({
      type: StockMovementType.PREP_REVERSED,
      direction: StockMovementDirection.IN,
      unitCost: decimal(40),
      incomingCostPolicy: 'PRESERVE',
      idempotencyKey: 'prep-void:issue-move',
    });
    expect(recordConsumedAsWaste).not.toHaveBeenCalled();
  });

  it('records inputs as spoiled waste when the batch failed', async () => {
    const { service, post, recordConsumedAsWaste, issued } = setup();

    await service.void(
      'tenant-id',
      'user-id',
      'batch-id',
      { reason: 'Gosong', disposition: 'WASTE' },
      true,
    );

    expect(post).not.toHaveBeenCalled();
    expect(recordConsumedAsWaste.mock.calls[0][1]).toMatchObject({
      reason: StockAdjustmentReason.SPOILED,
      consumed: issued,
    });
  });
});
