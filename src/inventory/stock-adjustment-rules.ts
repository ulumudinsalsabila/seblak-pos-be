import {
  Prisma,
  StockAdjustmentKind,
  StockAdjustmentReason,
  StockMovementDirection,
} from '@prisma/client';

/** Reasons each document kind accepts. Waste only removes stock; adjustments correct it either way. */
export const ADJUSTMENT_REASONS: Record<
  StockAdjustmentKind,
  StockAdjustmentReason[]
> = {
  [StockAdjustmentKind.WASTE]: [
    StockAdjustmentReason.EXPIRED,
    StockAdjustmentReason.SPOILED,
    StockAdjustmentReason.SPILLED,
    StockAdjustmentReason.DAMAGED,
    StockAdjustmentReason.STAFF_MEAL,
    StockAdjustmentReason.OTHER,
  ],
  [StockAdjustmentKind.ADJUSTMENT]: [
    StockAdjustmentReason.COUNT_CORRECTION,
    StockAdjustmentReason.FOUND,
    StockAdjustmentReason.DAMAGED,
    StockAdjustmentReason.OTHER,
  ],
};

/** Notes are mandatory for every manual adjustment and for waste with reason OTHER. */
export function adjustmentNotesRequired(
  kind: StockAdjustmentKind,
  reason: StockAdjustmentReason,
) {
  return (
    kind === StockAdjustmentKind.ADJUSTMENT ||
    reason === StockAdjustmentReason.OTHER
  );
}

/** Stock value change of a posted line: positive when stock comes in, negative when it goes out. */
export function signedAmount(
  direction: StockMovementDirection,
  amount: Prisma.Decimal | null,
) {
  if (amount === null) return null;
  return direction === StockMovementDirection.IN ? amount : amount.neg();
}

/** Sum of signed line values, or null when any line has no cost (an incomplete total would mislead). */
export function netAmount(amounts: Array<Prisma.Decimal | null>) {
  if (amounts.some((amount) => amount === null)) return null;
  return amounts.reduce<Prisma.Decimal>(
    (sum, amount) => sum.plus(amount!),
    new Prisma.Decimal(0),
  );
}

/**
 * Ledger movement a count variance needs: counted above expected brings stock in, below takes it out,
 * equal posts nothing.
 */
export function varianceMovement(variance: Prisma.Decimal) {
  if (variance.isZero()) return null;
  return {
    direction: variance.gt(0)
      ? StockMovementDirection.IN
      : StockMovementDirection.OUT,
    quantity: variance.abs(),
  };
}
