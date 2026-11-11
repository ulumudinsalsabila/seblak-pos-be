import { Prisma } from '@prisma/client';

/**
 * Cost a prep batch output carries: the whole input cost spread over the actual usable output, so shrinkage
 * raises the output's unit cost instead of being lost. Null when any input had no cost, since a partial total
 * would understate it.
 */
export function prepOutputCost(
  inputAmounts: Array<Prisma.Decimal | null>,
  actualQuantity: Prisma.Decimal,
) {
  if (actualQuantity.lte(0))
    throw new RangeError('Actual output must be positive');
  if (inputAmounts.some((amount) => amount === null))
    return { inputCost: null, unitCost: null };
  const inputCost = inputAmounts
    .reduce<Prisma.Decimal>(
      (sum, amount) => sum.plus(amount!),
      new Prisma.Decimal(0),
    )
    .toDecimalPlaces(6, Prisma.Decimal.ROUND_HALF_UP);
  return {
    inputCost,
    unitCost: inputCost
      .div(actualQuantity)
      .toDecimalPlaces(8, Prisma.Decimal.ROUND_HALF_UP),
  };
}

/** Actual output against the plan: yield percentage and the quantity lost (negative when output exceeded the plan). */
export function prepYield(
  plannedQuantity: Prisma.Decimal,
  actualQuantity: Prisma.Decimal,
) {
  return {
    yieldPercent: actualQuantity
      .div(plannedQuantity)
      .mul(100)
      .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP),
    shrinkage: plannedQuantity.minus(actualQuantity),
  };
}
