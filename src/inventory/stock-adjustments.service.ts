import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  Prisma,
  StockAdjustmentKind,
  StockMovementDirection,
  StockMovementType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateStockAdjustmentDto,
  ListStockAdjustmentsDto,
} from './inventory.dto';
import { InventoryLedgerService } from './inventory-ledger.service';
import { resolveLineUnits, toBaseQuantity } from './inventory-line-units';
import {
  ADJUSTMENT_REASONS,
  adjustmentNotesRequired,
  netAmount,
  signedAmount,
} from './stock-adjustment-rules';

const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

const adjustmentDetail = {
  location: { select: { id: true, name: true, code: true } },
  createdBy: { select: { id: true, name: true } },
  lines: {
    include: { item: { include: { baseUnit: true } }, unit: true },
    orderBy: { item: { name: 'asc' } },
  },
} satisfies Prisma.StockAdjustmentInclude;

type AdjustmentDetail = Prisma.StockAdjustmentGetPayload<{
  include: typeof adjustmentDetail;
}>;

const movementType: Record<StockAdjustmentKind, StockMovementType> = {
  [StockAdjustmentKind.WASTE]: StockMovementType.WASTE_POSTED,
  [StockAdjustmentKind.ADJUSTMENT]: StockMovementType.ADJUSTMENT_POSTED,
};

@Injectable()
export class StockAdjustmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: InventoryLedgerService,
  ) {}

  async list(
    tenantId: string,
    query: ListStockAdjustmentsDto,
    showCost: boolean,
  ) {
    const search = query.search?.trim();
    const where: Prisma.StockAdjustmentWhereInput = {
      tenantId,
      kind: query.kind,
      reason: query.reason,
      locationId: query.locationId,
      occurredAt:
        query.dateFrom || query.dateTo
          ? {
              gte: query.dateFrom ? new Date(query.dateFrom) : undefined,
              lte: query.dateTo ? new Date(query.dateTo) : undefined,
            }
          : undefined,
      ...(search
        ? {
            OR: [
              { notes: { contains: search, mode: 'insensitive' } },
              {
                lines: {
                  some: {
                    item: { name: { contains: search, mode: 'insensitive' } },
                  },
                },
              },
            ],
          }
        : {}),
    };
    const orderBy = {
      [query.sortBy]: query.sortOrder,
    } as Prisma.StockAdjustmentOrderByWithRelationInput;
    const [data, total] = await this.prisma.$transaction([
      this.prisma.stockAdjustment.findMany({
        where,
        include: adjustmentDetail,
        orderBy,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.stockAdjustment.count({ where }),
    ]);
    return {
      data: data.map((adjustment) => this.visible(adjustment, showCost)),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async create(
    tenantId: string,
    actorId: string,
    kind: StockAdjustmentKind,
    dto: CreateStockAdjustmentDto,
    showCost: boolean,
  ) {
    return this.visible(
      await this.post(tenantId, actorId, kind, dto),
      showCost,
    );
  }

  private async post(
    tenantId: string,
    actorId: string,
    kind: StockAdjustmentKind,
    dto: CreateStockAdjustmentDto,
  ) {
    if (!ADJUSTMENT_REASONS[kind].includes(dto.reason))
      throw new UnprocessableEntityException(
        `Reason ${dto.reason} is not allowed for ${kind.toLowerCase()}`,
      );
    const notes = dto.notes?.trim() || null;
    if (!notes && adjustmentNotesRequired(kind, dto.reason))
      throw new UnprocessableEntityException('Notes are required');
    if (new Set(dto.lines.map((line) => line.itemId)).size !== dto.lines.length)
      throw new UnprocessableEntityException(
        'A stock adjustment cannot contain the same item twice',
      );
    const directions = dto.lines.map((line, index) => {
      if (kind === StockAdjustmentKind.WASTE) {
        if (line.direction && line.direction !== StockMovementDirection.OUT)
          throw new UnprocessableEntityException(
            `Waste can only take stock out (line ${index + 1})`,
          );
        return StockMovementDirection.OUT;
      }
      if (!line.direction)
        throw new UnprocessableEntityException(
          `Direction is required for line ${index + 1}`,
        );
      return line.direction;
    });
    const occurredAt = dto.occurredAt ? new Date(dto.occurredAt) : new Date();
    if (occurredAt.getTime() > Date.now() + FUTURE_TOLERANCE_MS)
      throw new UnprocessableEntityException(
        'Adjustment date cannot be in the future',
      );
    const replayKey = {
      tenantId_clientRequestId: {
        tenantId,
        clientRequestId: dto.clientRequestId,
      },
    };

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const replay = await tx.stockAdjustment.findUnique({
            where: replayKey,
            include: adjustmentDetail,
          });
          if (replay) {
            if (replay.kind !== kind)
              throw new ConflictException(
                'Request id was already used for a different document',
              );
            return replay;
          }

          const location = await tx.stockLocation.findFirst({
            where: { id: dto.locationId, tenantId, isActive: true },
            select: { id: true },
          });
          if (!location)
            throw new NotFoundException('Active stock location not found');

          const resolved = await resolveLineUnits(
            tx,
            tenantId,
            dto.lines,
            occurredAt,
          );
          const lines = resolved.map(
            ({ line, item, unit, factorToBase }, index) => {
              const inputQuantity = new Prisma.Decimal(line.quantity);
              const quantity = toBaseQuantity(inputQuantity, factorToBase);
              if (quantity.lte(0))
                throw new UnprocessableEntityException(
                  `Quantity must be greater than zero for line ${index + 1}`,
                );
              return {
                itemId: item.id,
                unitId: unit.id,
                direction: directions[index],
                inputQuantity,
                factorToBase,
                quantity,
              };
            },
          );
          // Lock balances in a stable order so concurrent documents cannot deadlock.
          lines.sort((left, right) => left.itemId.localeCompare(right.itemId));

          const adjustment = await tx.stockAdjustment.create({
            data: {
              tenantId,
              locationId: location.id,
              clientRequestId: dto.clientRequestId,
              kind,
              reason: dto.reason,
              notes,
              occurredAt,
              createdById: actorId,
            },
          });

          const balances = await tx.stockBalance.findMany({
            where: {
              tenantId,
              locationId: location.id,
              itemId: { in: lines.map((line) => line.itemId) },
            },
            select: { itemId: true, averageUnitCost: true },
          });
          const averageCost = new Map(
            balances.map((balance) => [
              balance.itemId,
              balance.averageUnitCost,
            ]),
          );

          const amounts: Array<Prisma.Decimal | null> = [];
          for (const line of lines) {
            const movement = await this.ledger.post(tx, {
              tenantId,
              locationId: location.id,
              itemId: line.itemId,
              type: movementType[kind],
              direction: line.direction,
              quantity: line.quantity,
              // Stock found or corrected upward comes in at the current average, leaving the average unchanged.
              ...(line.direction === StockMovementDirection.IN
                ? {
                    unitCost: averageCost.get(line.itemId) ?? null,
                    incomingCostPolicy: 'PRESERVE' as const,
                  }
                : {}),
              sourceType: 'STOCK_ADJUSTMENT',
              sourceId: adjustment.id,
              idempotencyKey: `${kind.toLowerCase()}:${adjustment.id}:${line.itemId}`,
              notes: notes ?? `${kind} ${dto.reason}`,
              actorId,
              occurredAt,
            });
            await tx.stockAdjustmentLine.create({
              data: {
                tenantId,
                adjustmentId: adjustment.id,
                ...line,
                unitCost: movement.unitCost,
                amount: movement.amount,
              },
            });
            amounts.push(signedAmount(line.direction, movement.amount));
          }

          await tx.stockAdjustment.update({
            where: { id: adjustment.id },
            data: { totalAmount: netAmount(amounts) },
          });
          await tx.inventoryAuditEvent.create({
            data: {
              tenantId,
              actorId,
              action:
                kind === StockAdjustmentKind.WASTE
                  ? 'STOCK_WASTE_POSTED'
                  : 'STOCK_ADJUSTMENT_POSTED',
              entityType: 'StockAdjustment',
              entityId: adjustment.id,
              payload: dto as unknown as Prisma.InputJsonValue,
            },
          });
          return tx.stockAdjustment.findUniqueOrThrow({
            where: { id: adjustment.id },
            include: adjustmentDetail,
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const winner = await this.prisma.stockAdjustment.findUnique({
          where: replayKey,
          include: adjustmentDetail,
        });
        if (winner?.kind === kind) return winner;
      }
      throw error;
    }
  }

  private visible(adjustment: AdjustmentDetail, showCost: boolean) {
    if (showCost) return adjustment;
    return {
      ...adjustment,
      totalAmount: undefined,
      lines: adjustment.lines.map((line) => ({
        ...line,
        unitCost: undefined,
        amount: undefined,
      })),
    };
  }
}
