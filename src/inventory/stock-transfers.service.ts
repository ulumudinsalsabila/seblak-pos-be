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
  StockTransferStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateStockTransferDto,
  ListStockTransfersDto,
  ReasonDto,
  ReceiveStockTransferDto,
  ShipStockTransferDto,
  TransferLineDto,
} from './inventory.dto';
import { InventoryLedgerService } from './inventory-ledger.service';
import {
  applyReceipt,
  inTransit,
  requestStatusForTransfer,
  statusAfterReceipt,
} from './transfer-rules';

const person = { select: { id: true, name: true } };
const place = { select: { id: true, name: true, code: true } };

const transferDetail = {
  sourceLocation: place,
  destinationLocation: place,
  createdBy: person,
  shippedBy: person,
  closedBy: person,
  request: { select: { id: true, status: true } },
  lines: {
    include: { item: { include: { baseUnit: true } } },
    orderBy: { item: { name: 'asc' } },
  },
} satisfies Prisma.StockTransferInclude;

type TransferDetail = Prisma.StockTransferGetPayload<{
  include: typeof transferDetail;
}>;

const SOURCE_TYPE = 'STOCK_TRANSFER';
const RECEIVABLE: StockTransferStatus[] = [
  StockTransferStatus.SHIPPED,
  StockTransferStatus.PARTIALLY_RECEIVED,
];

/**
 * Stock moving between two locations of one tenant. Shipping posts TRANSFER_SHIPPED out of the source at its
 * average cost; each receipt posts TRANSFER_RECEIVED into the destination at that same cost. What was shipped
 * but neither received nor written off is in transit.
 */
@Injectable()
export class StockTransfersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: InventoryLedgerService,
  ) {}

  async list(
    tenantId: string,
    query: ListStockTransfersDto,
    showCost: boolean,
  ) {
    const search = query.search?.trim();
    const where: Prisma.StockTransferWhereInput = {
      tenantId,
      status: query.status,
      ...(query.locationId
        ? {
            OR: [
              { sourceLocationId: query.locationId },
              { destinationLocationId: query.locationId },
            ],
          }
        : {}),
      ...(search
        ? {
            AND: [
              {
                OR: [
                  { notes: { contains: search, mode: 'insensitive' } },
                  {
                    lines: {
                      some: {
                        item: {
                          name: { contains: search, mode: 'insensitive' },
                        },
                      },
                    },
                  },
                ],
              },
            ],
          }
        : {}),
    };
    const orderBy = {
      [query.sortBy]: query.sortOrder,
    } as Prisma.StockTransferOrderByWithRelationInput;
    const [data, total] = await this.prisma.$transaction([
      this.prisma.stockTransfer.findMany({
        where,
        include: transferDetail,
        orderBy,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.stockTransfer.count({ where }),
    ]);
    return {
      data: data.map((transfer) => this.visible(transfer, showCost)),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async findOne(tenantId: string, id: string, showCost: boolean) {
    const transfer = await this.prisma.stockTransfer.findFirst({
      where: { id, tenantId },
      include: transferDetail,
    });
    if (!transfer) throw new NotFoundException('Stock transfer not found');
    return this.visible(transfer, showCost);
  }

  /** A transfer created directly by someone allowed to approve transfers. */
  async create(
    tenantId: string,
    actorId: string,
    dto: CreateStockTransferDto,
    showCost: boolean,
  ) {
    const replayKey = {
      tenantId_clientRequestId: {
        tenantId,
        clientRequestId: dto.clientRequestId,
      },
    };
    const replay = await this.prisma.stockTransfer.findUnique({
      where: replayKey,
      include: transferDetail,
    });
    if (replay) return this.visible(replay, showCost);
    try {
      const transfer = await this.prisma.$transaction(async (tx) => {
        const id = await this.createInTransaction(tx, {
          tenantId,
          actorId,
          clientRequestId: dto.clientRequestId,
          sourceLocationId: dto.sourceLocationId,
          destinationLocationId: dto.destinationLocationId,
          notes: dto.notes,
          lines: dto.lines,
        });
        return tx.stockTransfer.findUniqueOrThrow({
          where: { id },
          include: transferDetail,
        });
      });
      return this.visible(transfer, showCost);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const winner = await this.prisma.stockTransfer.findUnique({
          where: replayKey,
          include: transferDetail,
        });
        if (winner) return this.visible(winner, showCost);
      }
      throw error;
    }
  }

  /** Validates and creates an APPROVED transfer inside the caller's transaction; returns its id. */
  async createInTransaction(
    tx: Prisma.TransactionClient,
    input: {
      tenantId: string;
      actorId: string;
      clientRequestId: string;
      requestId?: string;
      sourceLocationId: string;
      destinationLocationId: string;
      notes?: string | null;
      lines: TransferLineDto[];
    },
  ) {
    const { tenantId } = input;
    if (input.sourceLocationId === input.destinationLocationId)
      throw new UnprocessableEntityException(
        'Source and destination must be different locations',
      );
    const lines = positiveLines(input.lines);
    const [locationCount, itemCount] = await Promise.all([
      tx.stockLocation.count({
        where: {
          tenantId,
          isActive: true,
          id: { in: [input.sourceLocationId, input.destinationLocationId] },
        },
      }),
      tx.inventoryItem.count({
        where: {
          tenantId,
          isActive: true,
          id: { in: lines.map((line) => line.itemId) },
        },
      }),
    ]);
    // Lookups are tenant-scoped, so another tenant's location or item is simply not found.
    if (locationCount !== 2)
      throw new NotFoundException('Active stock location not found');
    if (itemCount !== lines.length)
      throw new NotFoundException('Active inventory item not found');
    const transfer = await tx.stockTransfer.create({
      data: {
        tenantId,
        clientRequestId: input.clientRequestId,
        requestId: input.requestId,
        sourceLocationId: input.sourceLocationId,
        destinationLocationId: input.destinationLocationId,
        notes: input.notes?.trim() || null,
        createdById: input.actorId,
        lines: { create: lines.map((line) => ({ tenantId, ...line })) },
      },
    });
    await this.audit(
      tx,
      tenantId,
      input.actorId,
      'STOCK_TRANSFER_CREATED',
      transfer.id,
      {
        requestId: input.requestId ?? null,
      },
    );
    return transfer.id;
  }

  /** Takes the stock out of the source; it is in transit until received. */
  async ship(
    tenantId: string,
    actorId: string,
    id: string,
    dto: ShipStockTransferDto,
    showCost: boolean,
  ) {
    const overrides = new Map(
      (dto.lines ?? []).map((line) => [
        line.itemId,
        new Prisma.Decimal(line.quantity),
      ]),
    );
    await this.prisma.$transaction(
      async (tx) => {
        const transfer = await this.lock(tx, tenantId, id, [
          StockTransferStatus.APPROVED,
        ]);
        const lines = await tx.stockTransferLine.findMany({
          where: { tenantId, transferId: id },
          orderBy: { itemId: 'asc' },
        });
        for (const itemId of overrides.keys())
          if (!lines.some((line) => line.itemId === itemId))
            throw new UnprocessableEntityException(
              'Shipped item is not part of this transfer',
            );
        const shipped = lines.map((line) => {
          const quantity = overrides.get(line.itemId) ?? line.quantity;
          if (quantity.gt(line.quantity))
            throw new UnprocessableEntityException(
              'Cannot ship more than the approved quantity',
            );
          return { line, quantity };
        });
        if (shipped.every(({ quantity }) => quantity.lte(0)))
          throw new UnprocessableEntityException('Ship at least one item');
        const shippedAt = new Date();
        for (const { line, quantity } of shipped) {
          if (quantity.lte(0)) continue;
          const movement = await this.ledger.post(tx, {
            tenantId,
            locationId: transfer.sourceLocationId,
            itemId: line.itemId,
            type: StockMovementType.TRANSFER_SHIPPED,
            direction: StockMovementDirection.OUT,
            quantity,
            sourceType: SOURCE_TYPE,
            sourceId: id,
            idempotencyKey: `transfer-ship:${id}:${line.itemId}`,
            notes: 'Transfer shipped',
            actorId,
            occurredAt: shippedAt,
          });
          await tx.stockTransferLine.update({
            where: { id: line.id },
            data: { shippedQuantity: quantity, unitCost: movement.unitCost },
          });
        }
        await tx.stockTransfer.update({
          where: { id },
          data: {
            status: StockTransferStatus.SHIPPED,
            shippedById: actorId,
            shippedAt,
          },
        });
        await this.audit(tx, tenantId, actorId, 'STOCK_TRANSFER_SHIPPED', id, {
          lines: shipped.map(({ line, quantity }) => ({
            itemId: line.itemId,
            quantity: quantity.toString(),
          })),
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return this.findOne(tenantId, id, showCost);
  }

  /** Receives part or all of what is in transit into the destination, at the cost it was shipped at. */
  async receive(
    tenantId: string,
    actorId: string,
    id: string,
    dto: ReceiveStockTransferDto,
    showCost: boolean,
  ) {
    const key = (itemId: string) =>
      `transfer-receive:${id}:${dto.clientRequestId}:${itemId}`;
    await this.prisma.$transaction(
      async (tx) => {
        const replay = await tx.stockMovement.findUnique({
          where: {
            tenantId_idempotencyKey: {
              tenantId,
              idempotencyKey: key(dto.lines[0].itemId),
            },
          },
          select: { id: true },
        });
        if (replay) return;
        const transfer = await this.lock(tx, tenantId, id, RECEIVABLE);
        const lines = await tx.stockTransferLine.findMany({
          where: { tenantId, transferId: id },
          orderBy: { itemId: 'asc' },
        });
        const incoming = dto.lines
          .map((line) => ({
            itemId: line.itemId,
            quantity: new Prisma.Decimal(line.quantity),
          }))
          .sort((left, right) => left.itemId.localeCompare(right.itemId));
        const received = applyReceipt(lines, incoming);
        const receivedAt = new Date();
        for (const { itemId, quantity } of incoming) {
          const line = lines.find((candidate) => candidate.itemId === itemId)!;
          await this.ledger.post(tx, {
            tenantId,
            locationId: transfer.destinationLocationId,
            itemId,
            type: StockMovementType.TRANSFER_RECEIVED,
            direction: StockMovementDirection.IN,
            quantity,
            unitCost: line.unitCost,
            incomingCostPolicy: 'WEIGHTED_AVERAGE',
            sourceType: SOURCE_TYPE,
            sourceId: id,
            idempotencyKey: key(itemId),
            notes: 'Transfer received',
            actorId,
            occurredAt: receivedAt,
          });
          await tx.stockTransferLine.update({
            where: { id: line.id },
            data: { receivedQuantity: received.get(itemId) },
          });
        }
        const updatedLines = lines.map((line) => ({
          ...line,
          receivedQuantity: received.get(line.itemId) ?? line.receivedQuantity,
        }));
        const status = statusAfterReceipt(updatedLines);
        await tx.stockTransfer.update({
          where: { id },
          data: { status, lastReceivedAt: receivedAt },
        });
        await this.syncRequest(tx, transfer.requestId, status, updatedLines);
        await this.audit(tx, tenantId, actorId, 'STOCK_TRANSFER_RECEIVED', id, {
          clientRequestId: dto.clientRequestId,
          lines: dto.lines,
        } as unknown as Prisma.InputJsonValue);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return this.findOne(tenantId, id, showCost);
  }

  /** Ends receiving: whatever is still in transit is written off as lost. */
  async close(
    tenantId: string,
    actorId: string,
    id: string,
    dto: ReasonDto,
    showCost: boolean,
  ) {
    await this.prisma.$transaction(async (tx) => {
      const transfer = await this.lock(tx, tenantId, id, RECEIVABLE);
      const lines = await tx.stockTransferLine.findMany({
        where: { tenantId, transferId: id },
      });
      const lost = lines.map((line) => ({
        ...line,
        lostQuantity: line.lostQuantity.plus(inTransit(line)),
      }));
      for (const line of lost)
        await tx.stockTransferLine.update({
          where: { id: line.id },
          data: { lostQuantity: line.lostQuantity },
        });
      await tx.stockTransfer.update({
        where: { id },
        data: {
          status: StockTransferStatus.RECEIVED,
          closedById: actorId,
          closedAt: new Date(),
          closeReason: dto.reason.trim(),
        },
      });
      await this.syncRequest(
        tx,
        transfer.requestId,
        StockTransferStatus.RECEIVED,
        lost,
      );
      await this.audit(tx, tenantId, actorId, 'STOCK_TRANSFER_CLOSED', id, {
        reason: dto.reason.trim(),
        lost: lines
          .filter((line) => inTransit(line).gt(0))
          .map((line) => ({
            itemId: line.itemId,
            quantity: inTransit(line).toString(),
          })),
      });
    });
    return this.findOne(tenantId, id, showCost);
  }

  /** Cancels a transfer that has not shipped; nothing has moved yet. */
  async cancel(
    tenantId: string,
    actorId: string,
    id: string,
    dto: ReasonDto,
    showCost: boolean,
  ) {
    await this.prisma.$transaction(async (tx) => {
      const transfer = await this.lock(tx, tenantId, id, [
        StockTransferStatus.APPROVED,
      ]);
      await tx.stockTransfer.update({
        where: { id },
        data: {
          status: StockTransferStatus.CANCELLED,
          closedById: actorId,
          closedAt: new Date(),
          closeReason: dto.reason.trim(),
        },
      });
      await this.syncRequest(
        tx,
        transfer.requestId,
        StockTransferStatus.CANCELLED,
        [],
      );
      await this.audit(tx, tenantId, actorId, 'STOCK_TRANSFER_CANCELLED', id, {
        reason: dto.reason.trim(),
      });
    });
    return this.findOne(tenantId, id, showCost);
  }

  private async syncRequest(
    tx: Prisma.TransactionClient,
    requestId: string | null,
    status: StockTransferStatus,
    lines: Parameters<typeof requestStatusForTransfer>[1],
  ) {
    if (!requestId) return;
    await tx.stockRequest.update({
      where: { id: requestId },
      data: { status: requestStatusForTransfer(status, lines) },
    });
  }

  /** Row-locks the transfer and checks it is in one of the allowed statuses. */
  private async lock(
    tx: Prisma.TransactionClient,
    tenantId: string,
    id: string,
    allowed: StockTransferStatus[],
  ) {
    await tx.$queryRaw`
      SELECT "id"
      FROM "StockTransfer"
      WHERE "id" = ${id}::uuid AND "tenantId" = ${tenantId}::uuid
      FOR UPDATE
    `;
    const transfer = await tx.stockTransfer.findFirst({
      where: { id, tenantId },
      select: {
        status: true,
        requestId: true,
        sourceLocationId: true,
        destinationLocationId: true,
      },
    });
    if (!transfer) throw new NotFoundException('Stock transfer not found');
    if (!allowed.includes(transfer.status))
      throw new ConflictException({
        code: 'STOCK_TRANSFER_STATUS_INVALID',
        message: `Stock transfer is ${transfer.status.toLowerCase()}`,
      });
    return transfer;
  }

  private audit(
    tx: Prisma.TransactionClient,
    tenantId: string,
    actorId: string,
    action: string,
    entityId: string,
    payload: Prisma.InputJsonValue,
  ) {
    return tx.inventoryAuditEvent.create({
      data: {
        tenantId,
        actorId,
        action,
        entityType: 'StockTransfer',
        entityId,
        payload,
      },
    });
  }

  private visible(transfer: TransferDetail, showCost: boolean) {
    if (showCost) return transfer;
    return {
      ...transfer,
      lines: transfer.lines.map((line) => ({ ...line, unitCost: undefined })),
    };
  }
}

/** Distinct items with positive quantities. */
export function positiveLines(lines: TransferLineDto[]) {
  if (new Set(lines.map((line) => line.itemId)).size !== lines.length)
    throw new UnprocessableEntityException('An item cannot be listed twice');
  return lines.map((line, index) => {
    const quantity = new Prisma.Decimal(line.quantity);
    if (quantity.lte(0))
      throw new UnprocessableEntityException(
        `Quantity must be greater than zero for line ${index + 1}`,
      );
    return { itemId: line.itemId, quantity };
  });
}
