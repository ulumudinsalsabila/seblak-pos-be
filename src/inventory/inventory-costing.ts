import { Prisma } from '@prisma/client';

export function weightedAverageCost(
  currentQuantity: Prisma.Decimal,
  currentAverage: Prisma.Decimal | null,
  incomingQuantity: Prisma.Decimal,
  incomingUnitCost: Prisma.Decimal,
) {
  if (incomingQuantity.lte(0))
    throw new RangeError('Incoming quantity must be positive');
  if (incomingUnitCost.lt(0))
    throw new RangeError('Incoming unit cost cannot be negative');
  if (currentQuantity.lte(0) || currentAverage === null) {
    return incomingUnitCost.toDecimalPlaces(8, Prisma.Decimal.ROUND_HALF_UP);
  }
  return currentQuantity
    .mul(currentAverage)
    .plus(incomingQuantity.mul(incomingUnitCost))
    .div(currentQuantity.plus(incomingQuantity))
    .toDecimalPlaces(8, Prisma.Decimal.ROUND_HALF_UP);
}

export function movementAmount(
  quantity: Prisma.Decimal,
  unitCost: Prisma.Decimal | null,
) {
  return unitCost
    ? quantity.mul(unitCost).toDecimalPlaces(6, Prisma.Decimal.ROUND_HALF_UP)
    : null;
}
