import { KitchenStatus, Prisma } from '@prisma/client';

export type ConsumptionPlan = {
  locationId: string;
  itemId: string;
  quantity: Prisma.Decimal;
  sourceType: string;
  sourceId: string;
  idempotencyKey: string;
  notes: string;
};

type SoldLine = {
  transactionItemId: string;
  quantity: number;
  selectedOptions: Array<{
    groupId: string;
    groupName: string;
    valueId: string;
    valueLabel: string;
  }>;
};

type OptionConsumptionRow = {
  id: string;
  groupId: string;
  valueId: string;
  locationId: string;
  itemId: string;
  quantity: Prisma.Decimal;
};

/** Ingredients the selected menu options of each sold line consume, scaled by the quantity sold. */
export function optionConsumptionPlans(
  lines: SoldLine[],
  rows: OptionConsumptionRow[],
  invoiceNo: string,
): ConsumptionPlan[] {
  return lines.flatMap((line) =>
    line.selectedOptions.flatMap((option) =>
      rows
        .filter(
          (row) =>
            row.groupId === option.groupId && row.valueId === option.valueId,
        )
        .map((row) => ({
          locationId: row.locationId,
          itemId: row.itemId,
          quantity: row.quantity.mul(line.quantity),
          sourceType: 'SALE_OPTION',
          sourceId: line.transactionItemId,
          // Keyed by the mapping row so an item used by both the recipe and an option posts twice, not once.
          idempotencyKey: `sale-opt:${line.transactionItemId}:${row.id}`,
          notes: `Sale ${invoiceNo}; ${option.groupName}: ${option.valueLabel}`,
        })),
    ),
  );
}

/**
 * What a void does with stock a sale consumed. Packaged (direct) goods and dishes the kitchen has not
 * completed go back to stock; ingredients of a completed dish are gone, so they are recorded as waste.
 */
export function voidStockAction(
  sourceType: string,
  kitchenStatus: KitchenStatus,
): 'RESTORE' | 'WASTE' {
  if (sourceType === 'SALE_DIRECT') return 'RESTORE';
  return kitchenStatus === KitchenStatus.COMPLETED ? 'WASTE' : 'RESTORE';
}
