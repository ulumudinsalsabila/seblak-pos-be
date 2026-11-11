import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { receivingFactor } from './purchase-receiving';

type LineRef = { itemId: string; unitId: string };

/**
 * Loads the active items and units of document lines and the factor that turns each line's unit into the
 * item's base unit at `at` (an item conversion wins over the generic dimension factor). Lines come back in
 * input order. Throws for an unknown item/unit or a unit with no conversion to the base unit.
 */
export async function resolveLineUnits<T extends LineRef>(
  tx: Prisma.TransactionClient,
  tenantId: string,
  lines: T[],
  at: Date,
) {
  const itemIds = [...new Set(lines.map((line) => line.itemId))];
  const unitIds = [...new Set(lines.map((line) => line.unitId))];
  const [items, units, conversions] = await Promise.all([
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
        validFrom: { lte: at },
        OR: [{ validTo: null }, { validTo: { gt: at } }],
      },
      orderBy: { validFrom: 'desc' },
    }),
  ]);
  const itemMap = new Map(items.map((item) => [item.id, item]));
  const unitMap = new Map(units.map((unit) => [unit.id, unit]));

  return lines.map((line, index) => {
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
    return { line, item, unit, factorToBase };
  });
}

/** Input quantity in base units, rounded to the ledger's 6 decimals. */
export function toBaseQuantity(
  inputQuantity: Prisma.Decimal,
  factorToBase: Prisma.Decimal,
) {
  return inputQuantity
    .mul(factorToBase)
    .toDecimalPlaces(6, Prisma.Decimal.ROUND_HALF_UP);
}
