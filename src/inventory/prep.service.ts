import {
  ConflictException,
  Injectable,
  NotFoundException,
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
import {
  CompletePrepBatchDto,
  ConfigurePrepRecipeDto,
  ListPrepBatchesDto,
  PrepLineDto,
  StartPrepBatchDto,
  VoidPrepBatchDto,
} from './inventory.dto';
import { InventoryLedgerService } from './inventory-ledger.service';
import { prepOutputCost, prepYield } from './prep-costing';
import { StockAdjustmentsService } from './stock-adjustments.service';

const person = { select: { id: true, name: true } };
const itemWithUnit = { include: { baseUnit: true } } as const;

const batchDetail = {
  location: { select: { id: true, name: true, code: true } },
  outputItem: itemWithUnit,
  startedBy: person,
  completedBy: person,
  voidedBy: person,
  inputs: {
    include: { item: itemWithUnit },
    orderBy: { item: { name: 'asc' } },
  },
} satisfies Prisma.PrepBatchInclude;

type BatchDetail = Prisma.PrepBatchGetPayload<{ include: typeof batchDetail }>;

const SOURCE_TYPE = 'PREP_BATCH';

/** Semi-finished production: prep recipes and batches that turn raw ingredients into a costed output. */
@Injectable()
export class PrepService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: InventoryLedgerService,
    private readonly adjustments: StockAdjustmentsService,
  ) {}

  /** Every active semi-finished item with its prep recipe, if one is set. */
  async listRecipes(tenantId: string) {
    const data = await this.prisma.inventoryItem.findMany({
      where: {
        tenantId,
        type: InventoryItemType.SEMI_FINISHED,
        isActive: true,
      },
      include: {
        baseUnit: true,
        prepRecipesProduced: {
          include: {
            lines: {
              include: { item: itemWithUnit },
              orderBy: { item: { name: 'asc' } },
            },
          },
        },
      },
      orderBy: { name: 'asc' },
    });
    return {
      data: data.map(({ prepRecipesProduced, ...item }) => ({
        ...item,
        recipe: prepRecipesProduced[0] ?? null,
      })),
      meta: { total: data.length },
    };
  }

  async configureRecipe(
    tenantId: string,
    actorId: string,
    outputItemId: string,
    dto: ConfigurePrepRecipeDto,
  ) {
    const outputQuantity = new Prisma.Decimal(dto.outputQuantity);
    if (outputQuantity.lte(0))
      throw new UnprocessableEntityException(
        'Output quantity must be greater than zero',
      );
    await this.validateFormula(tenantId, outputItemId, dto.lines);
    const lines = this.positiveLines(dto.lines);
    return this.prisma.$transaction(async (tx) => {
      const recipe = await tx.prepRecipe.upsert({
        where: { tenantId_outputItemId: { tenantId, outputItemId } },
        create: {
          tenantId,
          outputItemId,
          outputQuantity,
          notes: dto.notes?.trim() || null,
        },
        update: { outputQuantity, notes: dto.notes?.trim() || null },
      });
      await tx.prepRecipeLine.deleteMany({
        where: { tenantId, recipeId: recipe.id },
      });
      await tx.prepRecipeLine.createMany({
        data: lines.map((line) => ({ tenantId, recipeId: recipe.id, ...line })),
      });
      await tx.inventoryAuditEvent.create({
        data: {
          tenantId,
          actorId,
          action: 'PREP_RECIPE_CONFIGURED',
          entityType: 'PrepRecipe',
          entityId: recipe.id,
          payload: dto as unknown as Prisma.InputJsonValue,
        },
      });
      return tx.prepRecipe.findUniqueOrThrow({
        where: { id: recipe.id },
        include: {
          outputItem: itemWithUnit,
          lines: {
            include: { item: itemWithUnit },
            orderBy: { item: { name: 'asc' } },
          },
        },
      });
    });
  }

  async listBatches(
    tenantId: string,
    query: ListPrepBatchesDto,
    showCost: boolean,
  ) {
    const search = query.search?.trim();
    const where: Prisma.PrepBatchWhereInput = {
      tenantId,
      status: query.status,
      locationId: query.locationId,
      outputItemId: query.outputItemId,
      ...(search
        ? {
            OR: [
              { notes: { contains: search, mode: 'insensitive' } },
              {
                outputItem: { name: { contains: search, mode: 'insensitive' } },
              },
            ],
          }
        : {}),
    };
    const orderBy = {
      [query.sortBy]: query.sortOrder,
    } as Prisma.PrepBatchOrderByWithRelationInput;
    const [data, total] = await this.prisma.$transaction([
      this.prisma.prepBatch.findMany({
        where,
        include: batchDetail,
        orderBy,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.prepBatch.count({ where }),
    ]);
    return {
      data: data.map((batch) => this.visible(batch, showCost)),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async findBatch(tenantId: string, id: string, showCost: boolean) {
    const batch = await this.prisma.prepBatch.findFirst({
      where: { id, tenantId },
      include: batchDetail,
    });
    if (!batch) throw new NotFoundException('Prep batch not found');
    return this.visible(batch, showCost);
  }

  /** Starts a batch and issues its inputs from stock at their current average cost. */
  async start(
    tenantId: string,
    actorId: string,
    dto: StartPrepBatchDto,
    showCost: boolean,
  ) {
    const plannedQuantity = new Prisma.Decimal(dto.plannedQuantity);
    if (plannedQuantity.lte(0))
      throw new UnprocessableEntityException(
        'Planned output must be greater than zero',
      );
    const replayKey = {
      tenantId_clientRequestId: {
        tenantId,
        clientRequestId: dto.clientRequestId,
      },
    };
    const replay = await this.prisma.prepBatch.findUnique({
      where: replayKey,
      include: batchDetail,
    });
    if (replay) return this.visible(replay, showCost);
    await this.validateFormula(tenantId, dto.outputItemId, dto.lines);
    const lines = this.positiveLines(dto.lines).sort((left, right) =>
      left.itemId.localeCompare(right.itemId),
    );

    try {
      const batch = await this.prisma.$transaction(
        async (tx) => {
          const location = await tx.stockLocation.findFirst({
            where: { id: dto.locationId, tenantId, isActive: true },
            select: { id: true },
          });
          if (!location)
            throw new NotFoundException('Active stock location not found');
          const startedAt = new Date();
          const created = await tx.prepBatch.create({
            data: {
              tenantId,
              locationId: location.id,
              clientRequestId: dto.clientRequestId,
              outputItemId: dto.outputItemId,
              plannedQuantity,
              notes: dto.notes?.trim() || null,
              startedAt,
              startedById: actorId,
            },
          });
          for (const line of lines) {
            const movement = await this.ledger.post(tx, {
              tenantId,
              locationId: location.id,
              itemId: line.itemId,
              type: StockMovementType.PREP_ISSUED,
              direction: StockMovementDirection.OUT,
              quantity: line.quantity,
              sourceType: SOURCE_TYPE,
              sourceId: created.id,
              idempotencyKey: `prep-issue:${created.id}:${line.itemId}`,
              notes: 'Prep batch input',
              actorId,
              occurredAt: startedAt,
            });
            await tx.prepBatchInput.create({
              data: {
                tenantId,
                batchId: created.id,
                ...line,
                unitCost: movement.unitCost,
                amount: movement.amount,
              },
            });
          }
          await this.audit(
            tx,
            tenantId,
            actorId,
            'PREP_BATCH_STARTED',
            created.id,
            dto as unknown as Prisma.InputJsonValue,
          );
          return tx.prepBatch.findUniqueOrThrow({
            where: { id: created.id },
            include: batchDetail,
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      return this.visible(batch, showCost);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const winner = await this.prisma.prepBatch.findUnique({
          where: replayKey,
          include: batchDetail,
        });
        if (winner) return this.visible(winner, showCost);
      }
      throw error;
    }
  }

  /** Receives the actual output, carrying the whole input cost spread over it. */
  async complete(
    tenantId: string,
    actorId: string,
    id: string,
    dto: CompletePrepBatchDto,
    showCost: boolean,
  ) {
    const actualQuantity = new Prisma.Decimal(dto.actualQuantity);
    if (actualQuantity.lte(0))
      throw new UnprocessableEntityException(
        'Actual output must be greater than zero; void the batch if nothing usable came out',
      );
    await this.prisma.$transaction(
      async (tx) => {
        const batch = await this.lockInProgress(tx, tenantId, id);
        const inputs = await tx.prepBatchInput.findMany({
          where: { tenantId, batchId: id },
        });
        const { inputCost, unitCost } = prepOutputCost(
          inputs.map((input) => input.amount),
          actualQuantity,
        );
        const completedAt = new Date();
        await this.ledger.post(tx, {
          tenantId,
          locationId: batch.locationId,
          itemId: batch.outputItemId,
          type: StockMovementType.PREP_RECEIVED,
          direction: StockMovementDirection.IN,
          quantity: actualQuantity,
          unitCost,
          incomingCostPolicy: 'WEIGHTED_AVERAGE',
          sourceType: SOURCE_TYPE,
          sourceId: id,
          idempotencyKey: `prep-output:${id}`,
          notes: 'Prep batch output',
          actorId,
          occurredAt: completedAt,
        });
        await tx.prepBatch.update({
          where: { id },
          data: {
            status: PrepBatchStatus.COMPLETED,
            actualQuantity,
            inputCost,
            outputUnitCost: unitCost,
            completedAt,
            completedById: actorId,
            ...(dto.notes?.trim() ? { notes: dto.notes.trim() } : {}),
          },
        });
        const { yieldPercent, shrinkage } = prepYield(
          batch.plannedQuantity,
          actualQuantity,
        );
        await this.audit(tx, tenantId, actorId, 'PREP_BATCH_COMPLETED', id, {
          actualQuantity: actualQuantity.toString(),
          yieldPercent: yieldPercent.toString(),
          shrinkage: shrinkage.toString(),
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return this.findBatch(tenantId, id, showCost);
  }

  /** Voids an in-progress batch: inputs go back to stock (RESTOCK) or are recorded as spoiled waste (WASTE). */
  async void(
    tenantId: string,
    actorId: string,
    id: string,
    dto: VoidPrepBatchDto,
    showCost: boolean,
  ) {
    const reason = dto.reason.trim();
    await this.prisma.$transaction(
      async (tx) => {
        const batch = await this.lockInProgress(tx, tenantId, id);
        const issued = await tx.stockMovement.findMany({
          where: {
            tenantId,
            sourceType: SOURCE_TYPE,
            sourceId: id,
            type: StockMovementType.PREP_ISSUED,
          },
          orderBy: { itemId: 'asc' },
        });
        if (dto.disposition === 'WASTE') {
          await this.adjustments.recordConsumedAsWaste(tx, {
            tenantId,
            actorId,
            locationId: batch.locationId,
            reason: StockAdjustmentReason.SPOILED,
            notes: `Prep batch voided: ${reason}`,
            reversal: {
              type: StockMovementType.PREP_REVERSED,
              sourceType: 'PREP_BATCH_VOID_WASTE',
              keyPrefix: 'prep-void',
            },
            consumed: issued,
            auditPayload: { prepBatchId: id, reason: 'SPOILED' },
          });
        } else {
          for (const movement of issued) {
            await this.ledger.post(tx, {
              tenantId,
              locationId: movement.locationId,
              itemId: movement.itemId,
              type: StockMovementType.PREP_REVERSED,
              direction: StockMovementDirection.IN,
              quantity: movement.quantity,
              unitCost: movement.unitCost,
              incomingCostPolicy: 'PRESERVE',
              sourceType: 'PREP_BATCH_VOID',
              sourceId: id,
              idempotencyKey: `prep-void:${movement.id}`,
              notes: `Prep batch voided: ${reason}`.slice(0, 500),
              actorId,
            });
          }
        }
        await tx.prepBatch.update({
          where: { id },
          data: {
            status: PrepBatchStatus.VOIDED,
            voidedAt: new Date(),
            voidedById: actorId,
            voidReason: reason,
            voidDisposition: dto.disposition,
          },
        });
        await this.audit(tx, tenantId, actorId, 'PREP_BATCH_VOIDED', id, {
          reason,
          disposition: dto.disposition,
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return this.findBatch(tenantId, id, showCost);
  }

  /** Output must be an active semi-finished item; inputs must be distinct active items other than the output. */
  private async validateFormula(
    tenantId: string,
    outputItemId: string,
    lines: PrepLineDto[],
  ) {
    if (new Set(lines.map((line) => line.itemId)).size !== lines.length)
      throw new UnprocessableEntityException(
        'An input item cannot be listed twice',
      );
    if (lines.some((line) => line.itemId === outputItemId))
      throw new UnprocessableEntityException(
        'The output item cannot be its own input',
      );
    const [output, inputCount] = await Promise.all([
      this.prisma.inventoryItem.findFirst({
        where: { id: outputItemId, tenantId, isActive: true },
        select: { type: true },
      }),
      this.prisma.inventoryItem.count({
        where: {
          tenantId,
          isActive: true,
          id: { in: lines.map((line) => line.itemId) },
        },
      }),
    ]);
    if (!output) throw new NotFoundException('Active output item not found');
    if (output.type !== InventoryItemType.SEMI_FINISHED)
      throw new UnprocessableEntityException(
        'Prep output must be a semi-finished item',
      );
    if (inputCount !== lines.length)
      throw new NotFoundException('Active input item not found');
  }

  private positiveLines(lines: PrepLineDto[]) {
    return lines.map((line, index) => {
      const quantity = new Prisma.Decimal(line.quantity);
      if (quantity.lte(0))
        throw new UnprocessableEntityException(
          `Quantity must be greater than zero for line ${index + 1}`,
        );
      return { itemId: line.itemId, quantity };
    });
  }

  /** Row-locks the batch so completing and voiding it cannot race. */
  private async lockInProgress(
    tx: Prisma.TransactionClient,
    tenantId: string,
    id: string,
  ) {
    await tx.$queryRaw`
      SELECT "id"
      FROM "PrepBatch"
      WHERE "id" = ${id}::uuid AND "tenantId" = ${tenantId}::uuid
      FOR UPDATE
    `;
    const batch = await tx.prepBatch.findFirst({
      where: { id, tenantId },
      select: {
        status: true,
        locationId: true,
        outputItemId: true,
        plannedQuantity: true,
      },
    });
    if (!batch) throw new NotFoundException('Prep batch not found');
    if (batch.status !== PrepBatchStatus.IN_PROGRESS)
      throw new ConflictException({
        code: 'PREP_BATCH_STATUS_INVALID',
        message: `Prep batch is ${batch.status.toLowerCase()}`,
      });
    return batch;
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
        entityType: 'PrepBatch',
        entityId,
        payload,
      },
    });
  }

  private visible(batch: BatchDetail, showCost: boolean) {
    if (showCost) return batch;
    return {
      ...batch,
      inputCost: undefined,
      outputUnitCost: undefined,
      inputs: batch.inputs.map((input) => ({
        ...input,
        unitCost: undefined,
        amount: undefined,
      })),
    };
  }
}
