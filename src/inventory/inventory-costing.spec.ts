import { Prisma } from '@prisma/client';
import { movementAmount, weightedAverageCost } from './inventory-costing';

describe('inventory costing', () => {
  it('calculates weighted average without floating point loss', () => {
    expect(
      weightedAverageCost(
        new Prisma.Decimal('1000'),
        new Prisma.Decimal('35'),
        new Prisma.Decimal('2000'),
        new Prisma.Decimal('40'),
      ).toString(),
    ).toBe('38.33333333');
  });

  it('uses the incoming cost when no valued balance exists', () => {
    expect(
      weightedAverageCost(
        new Prisma.Decimal(0),
        null,
        new Prisma.Decimal('2000'),
        new Prisma.Decimal('40'),
      ).toString(),
    ).toBe('40');
  });

  it('calculates a stable movement cost snapshot', () => {
    expect(
      movementAmount(
        new Prisma.Decimal('20'),
        new Prisma.Decimal('40'),
      )?.toString(),
    ).toBe('800');
  });

  it('rejects non-positive incoming quantities', () => {
    expect(() =>
      weightedAverageCost(
        new Prisma.Decimal(0),
        null,
        new Prisma.Decimal(0),
        new Prisma.Decimal('40'),
      ),
    ).toThrow(RangeError);
  });
});
