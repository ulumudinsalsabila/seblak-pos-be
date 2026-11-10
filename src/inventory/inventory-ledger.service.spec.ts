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
