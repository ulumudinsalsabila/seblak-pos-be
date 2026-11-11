import { Prisma } from '@prisma/client';
import { prepOutputCost, prepYield } from './prep-costing';

const decimal = (value: string | number) => new Prisma.Decimal(value);

describe('prepOutputCost', () => {
  it('moves the whole input cost onto the actual output', () => {
    // 1000 g chili at Rp40/g -> 850 g usable sambal.
    const { inputCost, unitCost } = prepOutputCost(
      [decimal(40000)],
      decimal(850),
    );

    expect(inputCost?.toString()).toBe('40000');
    expect(unitCost?.toString()).toBe('47.05882353');
  });

  it('sums every input', () => {
    const { inputCost } = prepOutputCost(
      [decimal(40000), decimal('2500.5')],
      decimal(900),
    );

    expect(inputCost?.toString()).toBe('42500.5');
  });

  it('leaves the cost unknown when an input had no cost', () => {
    expect(prepOutputCost([decimal(40000), null], decimal(850))).toEqual({
      inputCost: null,
      unitCost: null,
    });
  });

  it('rejects an empty output', () => {
    expect(() => prepOutputCost([decimal(40000)], decimal(0))).toThrow(
      RangeError,
    );
  });
});

describe('prepYield', () => {
  it('reports yield and shrinkage against the plan', () => {
    const { yieldPercent, shrinkage } = prepYield(decimal(1000), decimal(850));

    expect(yieldPercent.toString()).toBe('85');
    expect(shrinkage.toString()).toBe('150');
  });

  it('reports negative shrinkage when output beats the plan', () => {
    expect(prepYield(decimal(900), decimal(950)).shrinkage.toString()).toBe(
      '-50',
    );
  });
});
