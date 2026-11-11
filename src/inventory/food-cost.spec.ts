import {
  Prisma,
  StockMovementDirection,
  StockMovementType,
} from '@prisma/client';
import {
  costPercent,
  lossCost,
  priceAnomalies,
  summarizeUsage,
} from './food-cost';

const decimal = (value: string | number) => new Prisma.Decimal(value);
const total = (
  type: StockMovementType,
  direction: StockMovementDirection,
  quantity: number,
  amount: number,
) => ({
  itemId: 'chili',
  type,
  direction,
  quantity: decimal(quantity),
  amount: decimal(amount),
});
const { IN, OUT } = StockMovementDirection;

describe('summarizeUsage', () => {
  it('nets sales against voids and adds losses on top', () => {
    const [chili] = summarizeUsage([
      total(StockMovementType.SALE_CONSUMED, OUT, 1000, 40000),
      total(StockMovementType.SALE_REVERSED, IN, 100, 4000),
      total(StockMovementType.WASTE_POSTED, OUT, 50, 2000),
      total(StockMovementType.STOCKTAKE_VARIANCE_POSTED, OUT, 30, 1200),
      total(StockMovementType.STOCKTAKE_VARIANCE_POSTED, IN, 10, 400),
      total(StockMovementType.ADJUSTMENT_POSTED, IN, 5, 200),
    ]);

    expect(chili.salesQuantity.toString()).toBe('900');
    expect(chili.salesCost.toString()).toBe('36000');
    expect(chili.wasteCost.toString()).toBe('2000');
    expect(chili.stocktakeQuantity.toString()).toBe('20');
    expect(chili.stocktakeCost.toString()).toBe('800');
    // Stock found by adjustment reduces the loss.
    expect(chili.adjustmentCost.toString()).toBe('-200');
    expect(lossCost(chili).toString()).toBe('2600');
  });

  it('ignores movements that do not consume stock', () => {
    expect(
      summarizeUsage([
        total(StockMovementType.PURCHASE_RECEIVED, IN, 2000, 80000),
        total(StockMovementType.PREP_ISSUED, OUT, 1000, 40000),
        total(StockMovementType.TRANSFER_SHIPPED, OUT, 500, 20000),
      ]),
    ).toEqual([]);
  });
});

describe('costPercent', () => {
  it('expresses cost as a share of revenue', () => {
    expect(costPercent(decimal(36000), decimal(120000))?.toString()).toBe('30');
  });

  it('is unknown without revenue', () => {
    expect(costPercent(decimal(36000), decimal(0))).toBeNull();
  });
});

describe('priceAnomalies', () => {
  const since = new Date('2026-11-01T00:00:00Z');
  const purchase = (unitCost: number, day: number) => ({
    itemId: 'chili',
    unitCost: decimal(unitCost),
    receivedAt: new Date(Date.UTC(2026, 10, day)),
  });

  it('flags a recent price jump against the previous purchase', () => {
    const [anomaly] = priceAnomalies(
      [purchase(40, 1), purchase(40, 5), purchase(60, 10)],
      since,
    );

    expect(anomaly.changePercent.toString()).toBe('50');
    expect(anomaly.previousUnitCost.toString()).toBe('40');
  });

  it('ignores small changes, single purchases and old jumps', () => {
    expect(priceAnomalies([purchase(40, 5), purchase(44, 10)], since)).toEqual(
      [],
    );
    expect(priceAnomalies([purchase(40, 10)], since)).toEqual([]);
    expect(
      priceAnomalies(
        [
          { ...purchase(40, 1), receivedAt: new Date('2026-09-01') },
          { ...purchase(80, 1), receivedAt: new Date('2026-10-01') },
        ],
        since,
      ),
    ).toEqual([]);
  });
});
