import { ConflictException } from '@nestjs/common';
import {
  Prisma,
  StockMovementDirection,
  StockMovementType,
} from '@prisma/client';
import { InventoryLedgerService } from './inventory-ledger.service';

describe('InventoryLedgerService idempotency', () => {
  const service = new InventoryLedgerService();
  const existing = {
    id: 'movement-id',
    tenantId: 'tenant-id',
    locationId: 'location-id',
    itemId: 'item-id',
    type: StockMovementType.OPENING_BALANCE,
    direction: StockMovementDirection.IN,
    quantity: new Prisma.Decimal('10'),
    unitCost: new Prisma.Decimal('2500'),
    amount: new Prisma.Decimal('25000'),
    balanceAfter: new Prisma.Decimal('10'),
    sourceType: 'OPENING_BALANCE_BATCH',
    sourceId: 'batch-id',
    idempotencyKey: 'opening:batch-id:location-id:item-id',
    notes: null,
    actorId: 'user-id',
    occurredAt: new Date(),
    createdAt: new Date(),
  };
  const input = {
    tenantId: 'tenant-id',
    locationId: 'location-id',
    itemId: 'item-id',
    type: StockMovementType.OPENING_BALANCE,
    direction: StockMovementDirection.IN,
    quantity: '10',
    unitCost: '2500',
    sourceType: 'OPENING_BALANCE_BATCH',
    sourceId: 'batch-id',
    idempotencyKey: 'opening:batch-id:location-id:item-id',
  };

  it('returns the original movement for an identical retry', async () => {
    const tx = {
      stockMovement: { findUnique: jest.fn().mockResolvedValue(existing) },
    } as unknown as Prisma.TransactionClient;

    await expect(service.post(tx, input)).resolves.toBe(existing);
  });

  it('rejects a retry that changes the incoming unit cost', async () => {
    const tx = {
      stockMovement: { findUnique: jest.fn().mockResolvedValue(existing) },
    } as unknown as Prisma.TransactionClient;

    await expect(
      service.post(tx, { ...input, unitCost: '2600' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('InventoryLedgerService stock guard', () => {
  const service = new InventoryLedgerService();
  const sale = {
    tenantId: 'tenant-id',
    locationId: 'location-id',
    itemId: 'item-id',
    type: StockMovementType.SALE_CONSUMED,
    direction: StockMovementDirection.OUT,
    quantity: '1',
    sourceType: 'SALE_DIRECT',
    sourceId: 'sale-item-id',
    idempotencyKey: 'sale:second',
  };

  function setup(allowNegative: boolean) {
    const update = jest.fn();
    const queryRaw = jest.fn();
    const tx = {
      stockMovement: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: 'movement-id',
          quantity: new Prisma.Decimal(1),
        }),
      },
      stockLocation: {
        findFirst: jest.fn().mockResolvedValue({ id: 'location-id' }),
      },
      inventoryItem: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'item-id', allowNegative }),
      },
      stockBalance: {
        upsert: jest.fn().mockResolvedValue({ id: 'balance-id' }),
        // The first sale already took the last unit.
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'balance-id',
          quantity: new Prisma.Decimal(0),
          averageUnitCost: new Prisma.Decimal(5000),
        }),
        update,
      },
      inventoryAuditEvent: { create: jest.fn() },
      $queryRaw: queryRaw,
    } as unknown as Prisma.TransactionClient;
    return { tx, update, queryRaw };
  }

  it('locks the balance row and refuses to take stock below zero', async () => {
    const { tx, update, queryRaw } = setup(false);

    await expect(service.post(tx, sale)).rejects.toMatchObject({
      response: { code: 'INSUFFICIENT_INVENTORY_STOCK' },
    });
    expect(queryRaw).toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('allows negative stock only for items configured to allow it', async () => {
    const { tx, update } = setup(true);

    await service.post(tx, sale);

    expect(update.mock.calls[0][0].data.quantity.toString()).toBe('-1');
  });
});
