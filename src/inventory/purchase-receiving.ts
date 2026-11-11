import { Prisma, UnitDimension } from '@prisma/client';

type UnitRef = {
  id: string;
  dimension: UnitDimension;
  factorToDimensionBase: Prisma.Decimal;
};

/**
 * Factor that turns one receiving unit into the item's base unit. An item
 * conversion (packaging, density) wins over the generic dimension factor.
 */
export function receivingFactor(
  baseUnit: UnitRef,
  unit: UnitRef,
  conversionFactor: Prisma.Decimal | null,
) {
  if (unit.id === baseUnit.id) return new Prisma.Decimal(1);
  if (conversionFactor) return conversionFactor;
  if (unit.dimension === baseUnit.dimension) {
    return unit.factorToDimensionBase.div(baseUnit.factorToDimensionBase);
  }
  return null;
}

export function receiptLineAmounts(
  inputQuantity: Prisma.Decimal,
  inputUnitPrice: Prisma.Decimal,
  factorToBase: Prisma.Decimal,
) {
  if (inputQuantity.lte(0))
    throw new RangeError('Received quantity must be positive');
  if (inputUnitPrice.lt(0))
    throw new RangeError('Unit price cannot be negative');
  if (factorToBase.lte(0))
    throw new RangeError('Conversion factor must be positive');
  return {
    quantity: inputQuantity
      .mul(factorToBase)
      .toDecimalPlaces(6, Prisma.Decimal.ROUND_HALF_UP),
    unitCost: inputUnitPrice
      .div(factorToBase)
      .toDecimalPlaces(8, Prisma.Decimal.ROUND_HALF_UP),
    amount: inputQuantity
      .mul(inputUnitPrice)
      .toDecimalPlaces(6, Prisma.Decimal.ROUND_HALF_UP),
  };
}

type BalanceRow = {
  locationId: string;
  itemId: string;
  quantity: Prisma.Decimal;
};

/** Balances whose quantity differs from the signed sum of their movements. */
export function reconcileBalances(
  balances: BalanceRow[],
  ledgerTotals: BalanceRow[],
) {
  const key = (row: { locationId: string; itemId: string }) =>
    `${row.locationId}:${row.itemId}`;
  const ledger = new Map(ledgerTotals.map((row) => [key(row), row.quantity]));
  const mismatches = balances.flatMap((balance) => {
    const ledgerQuantity = ledger.get(key(balance)) ?? new Prisma.Decimal(0);
    ledger.delete(key(balance));
    if (balance.quantity.equals(ledgerQuantity)) return [];
    return [
      {
        locationId: balance.locationId,
        itemId: balance.itemId,
        balanceQuantity: balance.quantity,
        ledgerQuantity,
        difference: balance.quantity.minus(ledgerQuantity),
      },
    ];
  });
  for (const row of ledgerTotals) {
    if (!ledger.has(key(row)) || row.quantity.isZero()) continue;
    mismatches.push({
      locationId: row.locationId,
      itemId: row.itemId,
      balanceQuantity: new Prisma.Decimal(0),
      ledgerQuantity: row.quantity,
      difference: row.quantity.neg(),
    });
  }
  return mismatches;
}
