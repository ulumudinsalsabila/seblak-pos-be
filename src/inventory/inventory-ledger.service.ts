import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  Prisma,
  StockMovementDirection,
  StockMovementType,
} from '@prisma/client';
import { movementAmount, weightedAverageCost } from './inventory-costing';

export type IncomingCostPolicy = 'PRESERVE' | 'REPLACE' | 'WEIGHTED_AVERAGE';

export type PostStockMovement = {
  tenantId: string;
  locationId: string;
  itemId: string;
  type: StockMovementType;
  direction: StockMovementDirection;
  quantity: Prisma.Decimal.Value;
  unitCost?: Prisma.Decimal.Value | null;
  incomingCostPolicy?: IncomingCostPolicy;
  sourceType: string;
  sourceId?: string | null;
  idempotencyKey: string;
  notes?: string | null;
  actorId?: string | null;
  occurredAt?: Date;
};

@Injectable()
export class InventoryLedgerService {
  async post(tx: Prisma.TransactionClient, input: PostStockMovement) {
    const quantity = new Prisma.Decimal(input.quantity);
    const inputUnitCost =
      input.unitCost === undefined || input.unitCost === null
        ? null
        : new Prisma.Decimal(input.unitCost);
    if (quantity.lte(0))
      throw new UnprocessableEntityException(
        'Movement quantity must be greater than zero',
      );

    const existing = await tx.stockMovement.findUnique({
      where: {
        tenantId_idempotencyKey: {
          tenantId: input.tenantId,
          idempotencyKey: input.idempotencyKey,
        },
      },
    });
    if (existing) {
      const incomingCostDiffers =
        input.direction === StockMovementDirection.IN &&
        (existing.unitCost === null
          ? inputUnitCost !== null
          : inputUnitCost === null || !existing.unitCost.equals(inputUnitCost));
      if (
        existing.locationId !== input.locationId ||
        existing.itemId !== input.itemId ||
        existing.type !== input.type ||
        existing.direction !== input.direction ||
        !existing.quantity.equals(quantity) ||
        incomingCostDiffers ||
        existing.sourceType !== input.sourceType ||
        existing.sourceId !== (input.sourceId ?? null)
      ) {
        throw new ConflictException(
          'Idempotency key was already used for a different movement',
        );
      }
      return existing;
    }

    const [location, item] = await Promise.all([
      tx.stockLocation.findFirst({
        where: {
          id: input.locationId,
          tenantId: input.tenantId,
          isActive: true,
        },
        select: { id: true },
      }),
      tx.inventoryItem.findFirst({
        where: { id: input.itemId, tenantId: input.tenantId, isActive: true },
        select: { id: true, allowNegative: true },
      }),
    ]);
    if (!location)
      throw new NotFoundException('Active stock location not found');
    if (!item) throw new NotFoundException('Active inventory item not found');

    const initial = await tx.stockBalance.upsert({
      where: {
        tenantId_locationId_itemId: {
          tenantId: input.tenantId,
          locationId: input.locationId,
          itemId: input.itemId,
        },
      },
      create: {
        tenantId: input.tenantId,
        locationId: input.locationId,
        itemId: input.itemId,
      },
      update: {},
      select: { id: true },
    });

    await tx.$queryRaw`
      SELECT "id"
      FROM "StockBalance"
      WHERE "id" = ${initial.id}::uuid
      FOR UPDATE
    `;
    const balance = await tx.stockBalance.findUniqueOrThrow({
      where: { id: initial.id },
    });

    const signedQuantity =
      input.direction === StockMovementDirection.IN ? quantity : quantity.neg();
    const nextQuantity = balance.quantity.plus(signedQuantity);
    if (nextQuantity.lt(0) && !item.allowNegative) {
      throw new UnprocessableEntityException({
        code: 'INSUFFICIENT_INVENTORY_STOCK',
        message: 'Inventory stock is insufficient',
      });
    }

    let movementUnitCost: Prisma.Decimal | null = null;
    let nextAverage = balance.averageUnitCost;
    if (input.direction === StockMovementDirection.OUT) {
      movementUnitCost = balance.averageUnitCost;
    } else if (inputUnitCost !== null) {
      movementUnitCost = inputUnitCost;
      if (movementUnitCost.lt(0))
        throw new UnprocessableEntityException('Unit cost cannot be negative');
      const policy = input.incomingCostPolicy ?? 'PRESERVE';
      if (policy === 'REPLACE') nextAverage = movementUnitCost;
      if (policy === 'WEIGHTED_AVERAGE') {
        nextAverage = weightedAverageCost(
          balance.quantity,
          balance.averageUnitCost,
          quantity,
          movementUnitCost,
        );
      }
    }

    await tx.stockBalance.update({
      where: { id: balance.id },
      data: {
        quantity: nextQuantity,
        averageUnitCost: nextAverage,
        version: { increment: 1 },
      },
    });
    const amount = movementAmount(quantity, movementUnitCost);
    const movement = await tx.stockMovement.create({
      data: {
        tenantId: input.tenantId,
        locationId: input.locationId,
        itemId: input.itemId,
        type: input.type,
        direction: input.direction,
        quantity,
        unitCost: movementUnitCost,
        amount,
        balanceAfter: nextQuantity,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        idempotencyKey: input.idempotencyKey,
        notes: input.notes,
        actorId: input.actorId,
        occurredAt: input.occurredAt,
      },
    });
    await tx.inventoryAuditEvent.create({
      data: {
        tenantId: input.tenantId,
        actorId: input.actorId,
        action: 'STOCK_MOVEMENT_POSTED',
        entityType: 'StockMovement',
        entityId: movement.id,
        payload: {
          type: movement.type,
          direction: movement.direction,
          quantity: movement.quantity.toString(),
          sourceType: movement.sourceType,
          sourceId: movement.sourceId,
        },
      },
    });
    return movement;
  }
}
