import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import {
  PrepBatchStatus,
  Prisma,
  StockMovementType,
  StockRequestStatus,
  StockTransferStatus,
  StocktakeStatus,
  TransactionStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  costPercent,
  lossCost,
  priceAnomalies,
  summarizeUsage,
} from './food-cost';
import { FoodCostReportDto } from './inventory.dto';
import { inTransit } from './transfer-rules';

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_RANGE_DAYS = 366;
const USAGE_TYPES = [
  StockMovementType.SALE_CONSUMED,
  StockMovementType.SALE_REVERSED,
  StockMovementType.WASTE_POSTED,
  StockMovementType.STOCKTAKE_VARIANCE_POSTED,
  StockMovementType.ADJUSTMENT_POSTED,
];
const zero = () => new Prisma.Decimal(0);

/** Owner reporting over the inventory ledger: food cost for a period, and operational alerts. */
@Injectable()
export class InventoryReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Theoretical cost (what sales consumed by recipe/option/direct mapping) against revenue, plus the losses on
   * top of it (waste, stocktake shortage, manual adjustments, transfers lost in transit). Every figure comes
   * from posted documents; `costCoverage` flags movements posted without a cost, which are left out of the
   * totals rather than guessed.
   */
  async foodCost(tenantId: string, query: FoodCostReportDto) {
    const from = new Date(query.dateFrom);
    const to = new Date(query.dateTo);
    if (from > to)
      throw new UnprocessableEntityException('dateFrom must be before dateTo');
    if (to.getTime() - from.getTime() > MAX_RANGE_DAYS * DAY_MS)
      throw new UnprocessableEntityException(
        `The period cannot exceed ${MAX_RANGE_DAYS} days`,
      );
    const location = query.outletId ? { outletId: query.outletId } : {};
    const movementWhere: Prisma.StockMovementWhereInput = {
      tenantId,
      type: { in: USAGE_TYPES },
      occurredAt: { gte: from, lte: to },
      location,
    };

    const [sales, totals, uncosted, purchases, batches, closedTransfers] =
      await Promise.all([
        this.prisma.transaction.aggregate({
          where: {
            outlet: { tenantId },
            outletId: query.outletId,
            status: TransactionStatus.PAID,
            paidAt: { gte: from, lte: to },
          },
          _sum: { subtotal: true, discount: true },
          _count: true,
        }),
        this.prisma.stockMovement.groupBy({
          by: ['itemId', 'type', 'direction'],
          where: movementWhere,
          _sum: { quantity: true, amount: true },
        }),
        this.prisma.stockMovement.count({
          where: { ...movementWhere, amount: null },
        }),
        this.prisma.purchaseReceipt.aggregate({
          where: { tenantId, receivedAt: { gte: from, lte: to }, location },
          _sum: { totalAmount: true },
          _count: true,
        }),
        this.prisma.prepBatch.findMany({
          where: {
            tenantId,
            status: PrepBatchStatus.COMPLETED,
            completedAt: { gte: from, lte: to },
            location,
          },
          select: {
            plannedQuantity: true,
            actualQuantity: true,
            outputUnitCost: true,
          },
        }),
        this.prisma.stockTransfer.findMany({
          where: {
            tenantId,
            closedAt: { gte: from, lte: to },
            status: StockTransferStatus.RECEIVED,
            destinationLocation: location,
          },
          select: { lines: { select: { lostQuantity: true, unitCost: true } } },
        }),
      ]);

    const usage = summarizeUsage(
      totals.map((total) => ({
        itemId: total.itemId,
        type: total.type,
        direction: total.direction,
        quantity: total._sum.quantity ?? zero(),
        amount: total._sum.amount ?? zero(),
      })),
    );
    const items = await this.prisma.inventoryItem.findMany({
      where: { tenantId, id: { in: usage.map((row) => row.itemId) } },
      select: {
        id: true,
        name: true,
        sku: true,
        type: true,
        baseUnit: { select: { symbol: true, precision: true } },
      },
    });
    const itemMap = new Map(items.map((item) => [item.id, item]));

    const revenue = new Prisma.Decimal(sales._sum.subtotal ?? 0).minus(
      sales._sum.discount ?? 0,
    );
    const sum = (pick: (row: (typeof usage)[number]) => Prisma.Decimal) =>
      usage.reduce((total, row) => total.plus(pick(row)), zero());
    const theoreticalCost = sum((row) => row.salesCost);
    const wasteCost = sum((row) => row.wasteCost);
    const stocktakeCost = sum((row) => row.stocktakeCost);
    const adjustmentCost = sum((row) => row.adjustmentCost);
    const transferLossCost = closedTransfers
      .flatMap((transfer) => transfer.lines)
      .reduce(
        (total, line) =>
          line.unitCost
            ? total.plus(line.lostQuantity.mul(line.unitCost))
            : total,
        zero(),
      );
    const actualCost = theoreticalCost
      .plus(wasteCost)
      .plus(stocktakeCost)
      .plus(adjustmentCost)
      .plus(transferLossCost);
    const planned = batches.reduce(
      (total, batch) => total.plus(batch.plannedQuantity),
      zero(),
    );
    const produced = batches.reduce(
      (total, batch) => total.plus(batch.actualQuantity ?? 0),
      zero(),
    );
    const shrinkageCost = batches.reduce((total, batch) => {
      if (!batch.actualQuantity || !batch.outputUnitCost) return total;
      const lost = batch.plannedQuantity.minus(batch.actualQuantity);
      return lost.gt(0) ? total.plus(lost.mul(batch.outputUnitCost)) : total;
    }, zero());

    return {
      period: { from, to, outletId: query.outletId ?? null },
      revenue,
      transactionCount: sales._count,
      theoreticalCost,
      wasteCost,
      stocktakeCost,
      adjustmentCost,
      transferLossCost,
      actualCost,
      theoreticalFoodCostPercent: costPercent(theoreticalCost, revenue),
      actualFoodCostPercent: costPercent(actualCost, revenue),
      purchaseSpend: purchases._sum.totalAmount ?? zero(),
      purchaseCount: purchases._count,
      prep: {
        batches: batches.length,
        yieldPercent: planned.gt(0)
          ? produced.div(planned).mul(100).toDecimalPlaces(2)
          : null,
        // Already inside the produced items' unit cost; shown for information, not added to actual cost.
        shrinkageCost,
      },
      costCoverage: { uncostedMovements: uncosted, complete: uncosted === 0 },
      items: usage
        .map((row) => ({
          ...row,
          item: itemMap.get(row.itemId) ?? null,
          lossCost: lossCost(row),
          actualCost: row.salesCost.plus(lossCost(row)),
        }))
        .sort((left, right) => right.lossCost.comparedTo(left.lossCost)),
    };
  }

  /** Things that need attention now. Cost figures are left out without cost access. */
  async alerts(tenantId: string, showCost: boolean) {
    const now = Date.now();
    const [
      balances,
      inTransitTransfers,
      pendingRequests,
      pendingStocktakes,
      unshippedTransfers,
      openBatches,
      recentPurchases,
    ] = await Promise.all([
      this.prisma.stockBalance.findMany({
        where: {
          tenantId,
          item: { isActive: true },
          location: { isActive: true },
        },
        select: {
          quantity: true,
          averageUnitCost: true,
          item: {
            select: {
              id: true,
              name: true,
              sku: true,
              reorderPoint: true,
              baseUnit: { select: { symbol: true } },
            },
          },
          location: { select: { id: true, name: true } },
        },
      }),
      this.prisma.stockTransfer.findMany({
        where: {
          tenantId,
          status: {
            in: [
              StockTransferStatus.SHIPPED,
              StockTransferStatus.PARTIALLY_RECEIVED,
            ],
          },
          shippedAt: { lt: new Date(now - 2 * DAY_MS) },
        },
        select: {
          id: true,
          shippedAt: true,
          sourceLocation: { select: { name: true } },
          destinationLocation: { select: { name: true } },
        },
        orderBy: { shippedAt: 'asc' },
        take: 20,
      }),
      this.prisma.stockRequest.count({
        where: { tenantId, status: StockRequestStatus.SUBMITTED },
      }),
      this.prisma.stocktake.count({
        where: { tenantId, status: StocktakeStatus.REVIEW },
      }),
      this.prisma.stockTransfer.count({
        where: {
          tenantId,
          status: StockTransferStatus.APPROVED,
          createdAt: { lt: new Date(now - DAY_MS) },
        },
      }),
      this.prisma.prepBatch.findMany({
        where: {
          tenantId,
          status: PrepBatchStatus.IN_PROGRESS,
          startedAt: { lt: new Date(now - DAY_MS) },
        },
        select: {
          id: true,
          startedAt: true,
          outputItem: { select: { name: true } },
          location: { select: { name: true } },
        },
        orderBy: { startedAt: 'asc' },
        take: 20,
      }),
      this.prisma.purchaseReceiptLine.findMany({
        where: {
          tenantId,
          receipt: { receivedAt: { gte: new Date(now - 120 * DAY_MS) } },
        },
        select: {
          itemId: true,
          unitCost: true,
          item: {
            select: { name: true, baseUnit: { select: { symbol: true } } },
          },
          receipt: { select: { receivedAt: true } },
        },
        take: 2000,
      }),
    ]);

    const stockRow = (balance: (typeof balances)[number]) => ({
      itemId: balance.item.id,
      name: balance.item.name,
      sku: balance.item.sku,
      unit: balance.item.baseUnit.symbol,
      location: balance.location.name,
      quantity: balance.quantity,
      reorderPoint: balance.item.reorderPoint,
    });
    const itemNames = new Map(
      recentPurchases.map((line) => [line.itemId, line.item]),
    );
    const anomalies = priceAnomalies(
      recentPurchases.map((line) => ({
        itemId: line.itemId,
        unitCost: line.unitCost,
        receivedAt: line.receipt.receivedAt,
      })),
      new Date(now - 30 * DAY_MS),
    ).map((anomaly) => ({
      itemId: anomaly.itemId,
      name: itemNames.get(anomaly.itemId)?.name ?? '-',
      unit: itemNames.get(anomaly.itemId)?.baseUnit.symbol ?? '',
      changePercent: anomaly.changePercent,
      receivedAt: anomaly.receivedAt,
      ...(showCost
        ? {
            latestUnitCost: anomaly.latestUnitCost,
            previousUnitCost: anomaly.previousUnitCost,
          }
        : {}),
    }));

    return {
      generatedAt: new Date(now),
      outOfStock: balances
        .filter((balance) => balance.quantity.lte(0))
        .map(stockRow)
        .slice(0, 50),
      lowStock: balances
        .filter(
          (balance) =>
            balance.quantity.gt(0) &&
            balance.quantity.lte(balance.item.reorderPoint),
        )
        .map(stockRow)
        .slice(0, 50),
      missingCost: balances.filter(
        (balance) => balance.quantity.gt(0) && balance.averageUnitCost === null,
      ).length,
      staleTransfers: inTransitTransfers,
      staleBatches: openBatches,
      pendingApprovals: {
        requests: pendingRequests,
        stocktakes: pendingStocktakes,
        unshippedTransfers,
      },
      priceAnomalies: anomalies,
    };
  }

  /** Quantity and value shipped but not yet received or written off. */
  async inTransit(tenantId: string) {
    const lines = await this.prisma.stockTransferLine.findMany({
      where: {
        tenantId,
        transfer: {
          status: {
            in: [
              StockTransferStatus.SHIPPED,
              StockTransferStatus.PARTIALLY_RECEIVED,
            ],
          },
        },
      },
    });
    const open = lines.filter((line) => inTransit(line).gt(0));
    return {
      lines: open.length,
      value: open.reduce(
        (total, line) =>
          line.unitCost
            ? total.plus(inTransit(line).mul(line.unitCost))
            : total,
        zero(),
      ),
    };
  }
}
