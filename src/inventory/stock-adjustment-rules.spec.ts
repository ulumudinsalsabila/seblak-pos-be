import {
  Prisma,
  StockAdjustmentKind,
  StockAdjustmentReason,
  StockMovementDirection,
} from '@prisma/client';
import {
  adjustmentNotesRequired,
  netAmount,
  signedAmount,
  varianceMovement,
} from './stock-adjustment-rules';

const decimal = (value: string | number) => new Prisma.Decimal(value);

describe('stock adjustment rules', () => {
  it('requires notes for every adjustment and for waste with reason OTHER', () => {
    expect(
      adjustmentNotesRequired(
        StockAdjustmentKind.ADJUSTMENT,
        StockAdjustmentReason.FOUND,
      ),
    ).toBe(true);
    expect(
      adjustmentNotesRequired(
        StockAdjustmentKind.WASTE,
        StockAdjustmentReason.OTHER,
      ),
    ).toBe(true);
    expect(
      adjustmentNotesRequired(
        StockAdjustmentKind.WASTE,
        StockAdjustmentReason.EXPIRED,
      ),
    ).toBe(false);
  });

  it('signs line values by direction and nets them', () => {
    const lines = [
      signedAmount(StockMovementDirection.IN, decimal(1200)),
      signedAmount(StockMovementDirection.OUT, decimal(800)),
    ];
    expect(netAmount(lines)?.toString()).toBe('400');
  });

  it('leaves the total empty when a line has no cost', () => {
    expect(
      netAmount([decimal(100), signedAmount(StockMovementDirection.OUT, null)]),
    ).toBeNull();
  });

  it('turns a count surplus into an IN movement and a shortage into OUT', () => {
    expect(varianceMovement(decimal('150.5'))).toEqual({
      direction: StockMovementDirection.IN,
      quantity: decimal('150.5'),
    });
    expect(varianceMovement(decimal(-20))).toEqual({
      direction: StockMovementDirection.OUT,
      quantity: decimal(20),
    });
    expect(varianceMovement(decimal(0))).toBeNull();
  });
});
