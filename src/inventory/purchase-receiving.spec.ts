import { Prisma, UnitDimension } from '@prisma/client';
import { movementAmount, weightedAverageCost } from './inventory-costing';
import {
  receiptLineAmounts,
  receivingFactor,
  reconcileBalances,
} from './purchase-receiving';

const decimal = (value: string | number) => new Prisma.Decimal(value);
const gram = {
  id: 'g',
  dimension: UnitDimension.MASS,
  factorToDimensionBase: decimal(1),
};
const kilogram = {
  id: 'kg',
  dimension: UnitDimension.MASS,
  factorToDimensionBase: decimal(1000),
};
const tray = {
  id: 'tray',
  dimension: UnitDimension.COUNT,
  factorToDimensionBase: decimal(1),
};

describe('purchase receiving', () => {
  it('stores 2 kg of chili at Rp40,000/kg as 2000 g at Rp40/g', () => {
    const factor = receivingFactor(gram, kilogram, null)!;
    const line = receiptLineAmounts(decimal(2), decimal(40000), factor);

    expect(line.quantity.toString()).toBe('2000');
    expect(line.unitCost.toString()).toBe('40');
    expect(line.amount.toString()).toBe('80000');

    const average = weightedAverageCost(
      decimal(0),
      null,
      line.quantity,
      line.unitCost,
    );
    expect(movementAmount(decimal(20), average)?.toString()).toBe('800');
  });

  it('uses factor 1 for the base unit', () => {
    expect(receivingFactor(gram, gram, decimal(5))?.toString()).toBe('1');
  });

  it('prefers the item conversion over the dimension factor', () => {
    expect(receivingFactor(gram, kilogram, decimal(950))?.toString()).toBe(
      '950',
    );
  });

  it('requires an item conversion across dimensions', () => {
    expect(receivingFactor(gram, tray, null)).toBeNull();
    expect(receivingFactor(gram, tray, decimal(1800))?.toString()).toBe('1800');
  });

  it('keeps fractional unit cost without rounding to whole rupiah', () => {
    const line = receiptLineAmounts(decimal(1), decimal(50000), decimal(30));
    expect(line.quantity.toString()).toBe('30');
    expect(line.unitCost.toString()).toBe('1666.66666667');
  });

  it('rejects non-positive quantities', () => {
    expect(() =>
      receiptLineAmounts(decimal(0), decimal(1), decimal(1)),
    ).toThrow(RangeError);
  });
});

describe('reconcileBalances', () => {
  const row = (itemId: string, quantity: string) => ({
    locationId: 'location',
    itemId,
    quantity: decimal(quantity),
  });

  it('reports nothing when balances match the ledger', () => {
    expect(
      reconcileBalances([row('chili', '1980')], [row('chili', '1980')]),
    ).toEqual([]);
  });

  it('reports drift and ledger totals that have no balance row', () => {
    const mismatches = reconcileBalances(
      [row('chili', '1900'), row('egg', '0')],
      [row('chili', '1980'), row('garlic', '50')],
    );

    expect(
      mismatches.map((mismatch) => [
        mismatch.itemId,
        mismatch.difference.toString(),
      ]),
    ).toEqual([
      ['chili', '-80'],
      ['garlic', '-50'],
    ]);
  });
});
