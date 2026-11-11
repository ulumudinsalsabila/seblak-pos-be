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
  StocktakeStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CancelStocktakeDto,
  CreateStocktakeDto,
  ListStocktakesDto,
  RecordStocktakeCountsDto,
} from './inventory.dto';
import { InventoryLedgerService } from './inventory-ledger.service';
import { resolveLineUnits, toBaseQuantity } from './inventory-line-units';
import { signedAmount, varianceMovement } from './stock-adjustment-rules';

const person = { select: { id: true, name: true } };

const stocktakeSummary = {
  location: { select: { id: true, name: true, code: true } },
  createdBy: person,
  submittedBy: person,
  approvedBy: person,
  cancelledBy: person,
  _count: { select: { lines: true } },
} satisfies Prisma.StocktakeInclude;

const stocktakeDetail = {
  ...stocktakeSummary,
  lines: {
    include: {
      item: { include: { baseUnit: true } },
      unit: true,
      countedBy: person,
    },
    orderBy: { item: { name: 'asc' } },
  },
} satisfies Prisma.StocktakeInclude;

type StocktakeDetail = Prisma.StocktakeGetPayload<{
  include: typeof stocktakeDetail;
}>;

const OPEN_STATUSES: StocktakeStatus[] = [
  StocktakeStatus.COUNTING,
  StocktakeStatus.REVIEW,
];

/**
 * Stock count sessions. Each counted line snapshots the ledger balance at the moment it is recorded
 * (expectedQuantity); approval posts counted - expected on top of the live balance. Sales and other movements
 * that happen while counting continues are therefore kept rather than overwritten by the count.
 */
@Injectable()
export class StocktakesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: InventoryLedgerService,
  ) {}

  async list(tenantId: string, query: ListStocktakesDto) {
    const search = query.search?.trim();
    const where: Prisma.StocktakeWhereInput = {
      tenantId,
      status: query.status,
      locationId: query.locationId,
      ...(search
        ? {
            OR: [
              { notes: { contains: search, mode: 'insensitive' } },
              { location: { name: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const orderBy = {
      [query.sortBy]: query.sortOrder,
    } as Prisma.StocktakeOrderByWithRelationInput;
    const [data, total] = await this.prisma.$transaction([
      this.prisma.stocktake.findMany({
        where,
        include: stocktakeSummary,
        orderBy,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.stocktake.count({ where }),
    ]);
    return {
      data,
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async findOne(tenantId: string, id: string, showCost: boolean) {
    const stocktake = await this.prisma.stocktake.findFirst({
      where: { id, tenantId },
      include: stocktakeDetail,
    });
    if (!stocktake) throw new NotFoundException('Stocktake not found');
    return this.visible(stocktake, showCost);
  }

  async create(tenantId: string, actorId: string, dto: CreateStocktakeDto) {
    const replayKey = {
      tenantId_clientRequestId: {
        tenantId,
        clientRequestId: dto.clientRequestId,
      },
    };
    const replay = await this.prisma.stocktake.findUnique({
      where: replayKey,
      include: stocktakeSummary,
    });
    if (replay) return replay;

    const location = await this.prisma.stockLocation.findFirst({
      where: { id: dto.locationId, tenantId, isActive: true },
      select: { id: true },
    });
    if (!location)
      throw new NotFoundException('Active stock location not found');
    try {
      return await this.prisma.$transaction(async (tx) => {
        const stocktake = await tx.stocktake.create({
          data: {
            tenantId,
            locationId: location.id,
            clientRequestId: dto.clientRequestId,
            notes: dto.notes?.trim() || null,
            createdById: actorId,
          },
          include: stocktakeSummary,
        });
        await this.audit(
          tx,
          tenantId,
          actorId,
          'STOCKTAKE_CREATED',
          stocktake.id,
          {
            locationId: location.id,
          },
        );
        return stocktake;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const winner = await this.prisma.stocktake.findUnique({
          where: replayKey,
          include: stocktakeSummary,
        });
        if (winner) return winner;
        // The partial unique index allows one COUNTING/REVIEW session per location.
        throw new ConflictException({
          code: 'STOCKTAKE_ALREADY_OPEN',
          message: 'This location already has an open stocktake',
        });
      }
      throw error;
    }
  }

  async recordCounts(
    tenantId: string,
    actorId: string,
    id: string,
    dto: RecordStocktakeCountsDto,
    showCost: boolean,
  ) {
    if (new Set(dto.lines.map((line) => line.itemId)).size !== dto.lines.length)
      throw new UnprocessableEntityException(
        'A count cannot contain the same item twice',
      );
    await this.prisma.$transaction(async (tx) => {
      const stocktake = await this.lock(tx, tenantId, id);
      this.expectStatus(stocktake.status, StocktakeStatus.COUNTING);
      const countedAt = new Date();
      const resolved = await resolveLineUnits(
        tx,
        tenantId,
        dto.lines,
        countedAt,
      );
      const balances = await tx.stockBalance.findMany({
        where: {
          tenantId,
          locationId: stocktake.locationId,
          itemId: { in: dto.lines.map((line) => line.itemId) },
        },
        select: { itemId: true, quantity: true },
      });
      const onHand = new Map(
        balances.map((balance) => [balance.itemId, balance.quantity]),
      );
      for (const { line, item, unit, factorToBase } of resolved) {
        const inputQuantity = new Prisma.Decimal(line.quantity);
        const countedQuantity = toBaseQuantity(inputQuantity, factorToBase);
        const expectedQuantity = onHand.get(item.id) ?? new Prisma.Decimal(0);
        const values = {
          unitId: unit.id,
          inputQuantity,
          factorToBase,
          countedQuantity,
          expectedQuantity,
          varianceQuantity: countedQuantity.minus(expectedQuantity),
          notes: line.notes?.trim() || null,
          countedById: actorId,
          countedAt,
        };
        await tx.stocktakeLine.upsert({
          where: { stocktakeId_itemId: { stocktakeId: id, itemId: item.id } },
          create: { tenantId, stocktakeId: id, itemId: item.id, ...values },
          update: values,
        });
      }
      await this.audit(tx, tenantId, actorId, 'STOCKTAKE_COUNTS_RECORDED', id, {
        lines: dto.lines,
      } as unknown as Prisma.InputJsonValue);
    });
    return this.findOne(tenantId, id, showCost);
  }

  async removeCount(
    tenantId: string,
    actorId: string,
    id: string,
    itemId: string,
    showCost: boolean,
  ) {
    await this.prisma.$transaction(async (tx) => {
      const stocktake = await this.lock(tx, tenantId, id);
      this.expectStatus(stocktake.status, StocktakeStatus.COUNTING);
      const removed = await tx.stocktakeLine.deleteMany({
        where: { tenantId, stocktakeId: id, itemId },
      });
      if (!removed.count)
        throw new NotFoundException('Counted item not found in this stocktake');
      await this.audit(tx, tenantId, actorId, 'STOCKTAKE_COUNT_REMOVED', id, {
        itemId,
      });
    });
    return this.findOne(tenantId, id, showCost);
  }

  async submit(
    tenantId: string,
    actorId: string,
    id: string,
    showCost: boolean,
  ) {
    await this.prisma.$transaction(async (tx) => {
      const stocktake = await this.lock(tx, tenantId, id);
      this.expectStatus(stocktake.status, StocktakeStatus.COUNTING);
      const counted = await tx.stocktakeLine.count({
        where: { tenantId, stocktakeId: id },
      });
      if (!counted)
        throw new UnprocessableEntityException(
          'Count at least one item before submitting',
        );
      await tx.stocktake.update({
        where: { id },
        data: {
          status: StocktakeStatus.REVIEW,
          submittedById: actorId,
          submittedAt: new Date(),
        },
      });
      await this.audit(tx, tenantId, actorId, 'STOCKTAKE_SUBMITTED', id);
    });
    return this.findOne(tenantId, id, showCost);
  }

  /** Sends a submitted count back for recounting. */
  async reopen(
    tenantId: string,
    actorId: string,
    id: string,
    showCost: boolean,
  ) {
    await this.prisma.$transaction(async (tx) => {
      const stocktake = await this.lock(tx, tenantId, id);
      this.expectStatus(stocktake.status, StocktakeStatus.REVIEW);
      await tx.stocktake.update({
        where: { id },
        data: {
          status: StocktakeStatus.COUNTING,
          submittedById: null,
          submittedAt: null,
        },
      });
      await this.audit(tx, tenantId, actorId, 'STOCKTAKE_REOPENED', id);
    });
    return this.findOne(tenantId, id, showCost);
  }

  /** Approves a submitted count and posts each non-zero variance to the ledger. */
  async approve(
    tenantId: string,
    actorId: string,
    id: string,
    showCost: boolean,
  ) {
    await this.prisma.$transaction(
      async (tx) => {
        const stocktake = await this.lock(tx, tenantId, id);
        this.expectStatus(stocktake.status, StocktakeStatus.REVIEW);
        const postedAt = new Date();
        const lines = await tx.stocktakeLine.findMany({
          where: { tenantId, stocktakeId: id },
          orderBy: { itemId: 'asc' },
        });
        const balances = await tx.stockBalance.findMany({
          where: {
            tenantId,
            locationId: stocktake.locationId,
            itemId: { in: lines.map((line) => line.itemId) },
          },
          select: { itemId: true, averageUnitCost: true },
        });
        const averageCost = new Map(
          balances.map((balance) => [balance.itemId, balance.averageUnitCost]),
        );
        for (const line of lines) {
          const movement = varianceMovement(line.varianceQuantity);
          let unitCost = averageCost.get(line.itemId) ?? null;
          let varianceAmount: Prisma.Decimal | null = unitCost
            ? new Prisma.Decimal(0)
            : null;
          if (movement) {
            const posted = await this.ledger.post(tx, {
              tenantId,
              locationId: stocktake.locationId,
              itemId: line.itemId,
              type: StockMovementType.STOCKTAKE_VARIANCE_POSTED,
              direction: movement.direction,
              quantity: movement.quantity,
              // A count surplus comes in at the current average, leaving the average unchanged.
              ...(movement.direction === StockMovementDirection.IN
                ? { unitCost, incomingCostPolicy: 'PRESERVE' as const }
                : {}),
              sourceType: 'STOCKTAKE',
              sourceId: id,
              idempotencyKey: `stocktake:${id}:${line.itemId}`,
              notes: `Stocktake variance (expected ${line.expectedQuantity.toString()}, counted ${line.countedQuantity.toString()})`,
              actorId,
              occurredAt: postedAt,
            });
            unitCost = posted.unitCost;
            varianceAmount = signedAmount(movement.direction, posted.amount);
          }
          await tx.stocktakeLine.update({
            where: { id: line.id },
            data: { unitCost, varianceAmount },
          });
        }
        await tx.stocktake.update({
          where: { id },
          data: {
            status: StocktakeStatus.POSTED,
            approvedById: actorId,
            postedAt,
          },
        });
        await this.audit(tx, tenantId, actorId, 'STOCKTAKE_POSTED', id, {
          lines: lines.length,
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return this.findOne(tenantId, id, showCost);
  }

  async cancel(
    tenantId: string,
    actorId: string,
    id: string,
    dto: CancelStocktakeDto,
    showCost: boolean,
  ) {
    await this.prisma.$transaction(async (tx) => {
      const stocktake = await this.lock(tx, tenantId, id);
      if (!OPEN_STATUSES.includes(stocktake.status))
        throw new ConflictException({
          code: 'STOCKTAKE_STATUS_INVALID',
          message: `Stocktake is ${stocktake.status.toLowerCase()} and can no longer be cancelled`,
        });
      await tx.stocktake.update({
        where: { id },
        data: {
          status: StocktakeStatus.CANCELLED,
          cancelledById: actorId,
          cancelledAt: new Date(),
          cancelReason: dto.reason.trim(),
        },
      });
      await this.audit(tx, tenantId, actorId, 'STOCKTAKE_CANCELLED', id, {
        reason: dto.reason.trim(),
      });
    });
    return this.findOne(tenantId, id, showCost);
  }

  /** Row-locks the session so status changes and counts on it are serialized. */
  private async lock(
    tx: Prisma.TransactionClient,
    tenantId: string,
    id: string,
  ) {
    await tx.$queryRaw`
      SELECT "id"
      FROM "Stocktake"
      WHERE "id" = ${id}::uuid AND "tenantId" = ${tenantId}::uuid
      FOR UPDATE
    `;
    const stocktake = await tx.stocktake.findFirst({
      where: { id, tenantId },
      select: { id: true, status: true, locationId: true },
    });
    if (!stocktake) throw new NotFoundException('Stocktake not found');
    return stocktake;
  }

  private expectStatus(actual: StocktakeStatus, expected: StocktakeStatus) {
    if (actual !== expected)
      throw new ConflictException({
        code: 'STOCKTAKE_STATUS_INVALID',
        message: `Stocktake is ${actual.toLowerCase()}, expected ${expected.toLowerCase()}`,
      });
  }

  private audit(
    tx: Prisma.TransactionClient,
    tenantId: string,
    actorId: string,
    action: string,
    entityId: string,
    payload?: Prisma.InputJsonValue,
  ) {
    return tx.inventoryAuditEvent.create({
      data: {
        tenantId,
        actorId,
        action,
        entityType: 'Stocktake',
        entityId,
        payload,
      },
    });
  }

  private visible(stocktake: StocktakeDetail, showCost: boolean) {
    if (showCost) return stocktake;
    return {
      ...stocktake,
      lines: stocktake.lines.map((line) => ({
        ...line,
        unitCost: undefined,
        varianceAmount: undefined,
      })),
    };
  }
}
