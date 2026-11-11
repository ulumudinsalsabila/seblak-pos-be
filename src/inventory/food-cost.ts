import {
  Prisma,
  StockMovementDirection,
  StockMovementType,
} from '@prisma/client';

type Decimal = Prisma.Decimal;
const zero = () => new Prisma.Decimal(0);

/** Ledger totals per item, movement type and direction for a period. */
export type MovementTotal = {
  itemId: string;
  type: StockMovementType;
  direction: StockMovementDirection;
  quantity: Decimal;
  amount: Decimal;
};

export type ItemUsage = {
  itemId: string;
  /** Consumed by sales (recipes, options, direct items) net of voids. */
  salesQuantity: Decimal;
  salesCost: Decimal;
  wasteQuantity: Decimal;
  wasteCost: Decimal;
  /** Stocktake shortage net of surpluses: positive means stock went missing. */
  stocktakeQuantity: Decimal;
  stocktakeCost: Decimal;
  /** Manual adjustments out net of adjustments in. */
  adjustmentQuantity: Decimal;
  adjustmentCost: Decimal;
};

/**
 * Splits ledger totals into what sales consumed (theoretical usage) and what was lost on top of it. Each value
 * is positive when stock left the shelf. Prep, transfers, purchases and opening balances move stock without
 * consuming it, so they are not usage.
 */
export function summarizeUsage(totals: MovementTotal[]) {
  const usage = new Map<string, ItemUsage>();
  const row = (itemId: string) => {
    let current = usage.get(itemId);
    if (!current) {
      current = {
        itemId,
        salesQuantity: zero(),
        salesCost: zero(),
        wasteQuantity: zero(),
        wasteCost: zero(),
        stocktakeQuantity: zero(),
        stocktakeCost: zero(),
        adjustmentQuantity: zero(),
        adjustmentCost: zero(),
      };
      usage.set(itemId, current);
    }
    return current;
  };
  for (const total of totals) {
    const sign = total.direction === StockMovementDirection.OUT ? 1 : -1;
    const quantity = total.quantity.mul(sign);
    const amount = total.amount.mul(sign);
    const bucket = USAGE_BUCKET[total.type];
    if (!bucket) continue;
    const [quantityKey, costKey] = bucket;
    const current = row(total.itemId);
    current[quantityKey] = current[quantityKey].plus(quantity);
    current[costKey] = current[costKey].plus(amount);
  }
  return [...usage.values()];
}

type UsageKey = Exclude<keyof ItemUsage, 'itemId'>;

const USAGE_BUCKET: Partial<Record<StockMovementType, [UsageKey, UsageKey]>> = {
  [StockMovementType.SALE_CONSUMED]: ['salesQuantity', 'salesCost'],
  [StockMovementType.SALE_REVERSED]: ['salesQuantity', 'salesCost'],
  [StockMovementType.WASTE_POSTED]: ['wasteQuantity', 'wasteCost'],
  [StockMovementType.STOCKTAKE_VARIANCE_POSTED]: [
    'stocktakeQuantity',
    'stocktakeCost',
  ],
  [StockMovementType.ADJUSTMENT_POSTED]: [
    'adjustmentQuantity',
    'adjustmentCost',
  ],
};

/** Losses on top of theoretical usage: waste, stocktake shortage and manual adjustments out. */
export function lossCost(usage: ItemUsage) {
  return usage.wasteCost.plus(usage.stocktakeCost).plus(usage.adjustmentCost);
}

/** Cost as a percentage of revenue, or null without revenue. */
export function costPercent(cost: Decimal, revenue: Decimal) {
  if (revenue.lte(0)) return null;
  return cost
    .div(revenue)
    .mul(100)
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

type PurchasePrice = { itemId: string; unitCost: Decimal; receivedAt: Date };

/**
 * Items whose latest purchase (received on or after `since`) changed price by at least `threshold` percent
 * against the purchase before it.
 */
export function priceAnomalies(
  purchases: PurchasePrice[],
  since: Date,
  threshold = 30,
) {
  const byItem = new Map<string, PurchasePrice[]>();
  for (const purchase of purchases)
    byItem.set(purchase.itemId, [
      ...(byItem.get(purchase.itemId) ?? []),
      purchase,
    ]);
  return [...byItem.entries()].flatMap(([itemId, history]) => {
    const [latest, previous] = [...history].sort(
      (left, right) => right.receivedAt.getTime() - left.receivedAt.getTime(),
    );
    if (!latest || !previous || latest.receivedAt < since) return [];
    if (previous.unitCost.lte(0)) return [];
    const changePercent = latest.unitCost
      .minus(previous.unitCost)
      .div(previous.unitCost)
      .mul(100)
      .toDecimalPlaces(1, Prisma.Decimal.ROUND_HALF_UP);
    if (changePercent.abs().lt(threshold)) return [];
    return [
      {
        itemId,
        latestUnitCost: latest.unitCost,
        previousUnitCost: previous.unitCost,
        changePercent,
        receivedAt: latest.receivedAt,
      },
    ];
  });
}
