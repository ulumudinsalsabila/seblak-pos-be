import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  Prisma,
  StockMovementDirection,
  StockMovementType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreatePurchaseReceiptDto,
  ListPurchaseReceiptsDto,
} from './inventory.dto';
import { InventoryLedgerService } from './inventory-ledger.service';
import {
  receiptLineAmounts,
  receivingFactor,
  reconcileBalances,
} from './purchase-receiving';

const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

const receiptDetail = {
  location: { select: { id: true, name: true, code: true } },
  createdBy: { select: { id: true, name: true } },
  lines: {
    include: { item: { include: { baseUnit: true } }, unit: true },
    orderBy: { item: { name: 'asc' } },
  },
} satisfies Prisma.PurchaseReceiptInclude;

type ReceiptDetail = Prisma.PurchaseReceiptGetPayload<{
  include: typeof receiptDetail;
}>;

@Injectable()
export class PurchaseReceiptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: InventoryLedgerService,
  ) {}

  async list(
    tenantId: string,
    query: ListPurchaseReceiptsDto,
    showCost: boolean,
  ) {
    const search = query.search?.trim();
    const where: Prisma.PurchaseReceiptWhereInput = {
      tenantId,
      locationId: query.locationId,
      receivedAt:
        query.dateFrom || query.dateTo
          ? {
              gte: query.dateFrom ? new Date(query.dateFrom) : undefined,
              lte: query.dateTo ? new Date(query.dateTo) : undefined,
            }
          : undefined,
      ...(search
        ? {
            OR: [
              { supplierName: { contains: search, mode: 'insensitive' } },
              { referenceNo: { contains: search, mode: 'insensitive' } },
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
    } as Prisma.PurchaseReceiptOrderByWithRelationInput;
    const [data, total] = await this.prisma.$transaction([
      this.prisma.purchaseReceipt.findMany({
        where,
        include: receiptDetail,
        orderBy,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.purchaseReceipt.count({ where }),
    ]);
    return {
      data: data.map((receipt) => this.visible(receipt, showCost)),
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
    dto: CreatePurchaseReceiptDto,
  ) {
    if (new Set(dto.lines.map((line) => line.itemId)).size !== dto.lines.length)
      throw new UnprocessableEntityException(
        'Purchase receipt cannot contain the same item twice',
      );
    const receivedAt = dto.receivedAt ? new Date(dto.receivedAt) : new Date();
    if (receivedAt.getTime() > Date.now() + FUTURE_TOLERANCE_MS)
      throw new UnprocessableEntityException(
        'Received date cannot be in the future',
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
          const replay = await tx.purchaseReceipt.findUnique({
            where: replayKey,
            include: receiptDetail,
          });
          if (replay) return replay;

          const itemIds = dto.lines.map((line) => line.itemId);
          const unitIds = [...new Set(dto.lines.map((line) => line.unitId))];
          const [location, items, units, conversions] = await Promise.all([
            tx.stockLocation.findFirst({
              where: { id: dto.locationId, tenantId, isActive: true },
              select: { id: true },
            }),
            tx.inventoryItem.findMany({
              where: { tenantId, isActive: true, id: { in: itemIds } },
              include: { baseUnit: true },
            }),
            tx.inventoryUnit.findMany({
              where: { tenantId, isActive: true, id: { in: unitIds } },
            }),
            tx.itemUnitConversion.findMany({
              where: {
                tenantId,
                itemId: { in: itemIds },
                unitId: { in: unitIds },
                validFrom: { lte: receivedAt },
                OR: [{ validTo: null }, { validTo: { gt: receivedAt } }],
              },
              orderBy: { validFrom: 'desc' },
            }),
          ]);
          if (!location)
            throw new NotFoundException('Active stock location not found');
          const itemMap = new Map(items.map((item) => [item.id, item]));
          const unitMap = new Map(units.map((unit) => [unit.id, unit]));

          const lines = dto.lines.map((line, index) => {
            const item = itemMap.get(line.itemId);
            const unit = unitMap.get(line.unitId);
            if (!item)
              throw new NotFoundException(
                `Active inventory item not found for line ${index + 1}`,
              );
            if (!unit)
              throw new NotFoundException(
                `Active inventory unit not found for line ${index + 1}`,
              );
            const conversion = conversions.find(
              (candidate) =>
                candidate.itemId === item.id && candidate.unitId === unit.id,
            );
            const factorToBase = receivingFactor(
              item.baseUnit,
              unit,
              conversion?.factorToBase ?? null,
            );
            if (!factorToBase)
              throw new UnprocessableEntityException({
                code: 'UNIT_CONVERSION_MISSING',
                message: `${item.name} has no conversion from ${unit.name} to ${item.baseUnit.name}`,
              });
            const inputQuantity = new Prisma.Decimal(line.quantity);
            if (inputQuantity.lte(0))
              throw new UnprocessableEntityException(
                `Received quantity must be greater than zero for line ${index + 1}`,
              );
            const inputUnitPrice = new Prisma.Decimal(line.unitPrice);
            const amounts = receiptLineAmounts(
              inputQuantity,
              inputUnitPrice,
              factorToBase,
            );
            if (amounts.quantity.lte(0))
              throw new UnprocessableEntityException(
                `Received quantity is too small for line ${index + 1}`,
              );
            return {
              itemId: item.id,
              unitId: unit.id,
              inputQuantity,
              inputUnitPrice,
              factorToBase,
              ...amounts,
            };
          });
          lines.sort((left, right) => left.itemId.localeCompare(right.itemId));

          const receipt = await tx.purchaseReceipt.create({
            data: {
              tenantId,
              locationId: location.id,
              clientRequestId: dto.clientRequestId,
              supplierName: dto.supplierName.trim(),
              referenceNo: dto.referenceNo?.trim() || null,
              notes: dto.notes?.trim() || null,
              totalAmount: lines.reduce(
                (sum, line) => sum.plus(line.amount),
                new Prisma.Decimal(0),
              ),
              receivedAt,
              createdById: actorId,
              lines: {
                create: lines.map((line) => ({ tenantId, ...line })),
              },
            },
          });
          for (const line of lines) {
            await this.ledger.post(tx, {
              tenantId,
              locationId: location.id,
              itemId: line.itemId,
              type: StockMovementType.PURCHASE_RECEIVED,
              direction: StockMovementDirection.IN,
              quantity: line.quantity,
              unitCost: line.unitCost,
              incomingCostPolicy: 'WEIGHTED_AVERAGE',
              sourceType: 'PURCHASE_RECEIPT',
              sourceId: receipt.id,
              idempotencyKey: `purchase:${receipt.id}:${line.itemId}`,
              notes: `Purchase from ${receipt.supplierName}`,
              actorId,
              occurredAt: receivedAt,
            });
          }
          await tx.inventoryAuditEvent.create({
            data: {
              tenantId,
              actorId,
              action: 'PURCHASE_RECEIPT_POSTED',
              entityType: 'PurchaseReceipt',
              entityId: receipt.id,
              payload: dto as unknown as Prisma.InputJsonValue,
            },
          });
          return tx.purchaseReceipt.findUniqueOrThrow({
            where: { id: receipt.id },
            include: receiptDetail,
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const winner = await this.prisma.purchaseReceipt.findUnique({
          where: replayKey,
          include: receiptDetail,
        });
        if (winner) return winner;
      }
      throw error;
    }
  }

  async reconciliation(tenantId: string) {
    const [balances, grouped] = await Promise.all([
      this.prisma.stockBalance.findMany({
        where: { tenantId },
        select: {
          locationId: true,
          itemId: true,
          quantity: true,
          item: { select: { name: true, sku: true } },
          location: { select: { name: true, code: true } },
        },
      }),
      this.prisma.stockMovement.groupBy({
        by: ['locationId', 'itemId', 'direction'],
        where: { tenantId },
        _sum: { quantity: true },
      }),
    ]);
    const totals = new Map<
      string,
      { locationId: string; itemId: string; quantity: Prisma.Decimal }
    >();
    for (const group of grouped) {
      const key = `${group.locationId}:${group.itemId}`;
      const sum = group._sum.quantity ?? new Prisma.Decimal(0);
      const signed =
        group.direction === StockMovementDirection.IN ? sum : sum.neg();
      const current = totals.get(key);
      totals.set(key, {
        locationId: group.locationId,
        itemId: group.itemId,
        quantity: current ? current.quantity.plus(signed) : signed,
      });
    }
    const labels = new Map(
      balances.map((balance) => [
        `${balance.locationId}:${balance.itemId}`,
        { item: balance.item, location: balance.location },
      ]),
    );
    const mismatches = reconcileBalances(balances, [...totals.values()]).map(
      (mismatch) => ({
        ...mismatch,
        ...labels.get(`${mismatch.locationId}:${mismatch.itemId}`),
      }),
    );
    return {
      checkedBalances: balances.length,
      isReconciled: mismatches.length === 0,
      mismatches,
    };
  }

  private visible(receipt: ReceiptDetail, showCost: boolean) {
    if (showCost) return receipt;
    return {
      ...receipt,
      totalAmount: undefined,
      lines: receipt.lines.map((line) => ({
        ...line,
        inputUnitPrice: undefined,
        unitCost: undefined,
        amount: undefined,
      })),
    };
  }
}
