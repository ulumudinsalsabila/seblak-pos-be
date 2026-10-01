import { calculateTotals } from './calculation';

describe('calculateTotals', () => {
  it('calculates discount before tax and rounds to rupiah', () => {
    expect(calculateTotals([15_000, 7_500], 2_500, 11)).toEqual({
      subtotal: 22_500,
      discount: 2_500,
      taxableTotal: 20_000,
      tax: 2_200,
      total: 22_200,
    });
  });

  it('supports checkout without tax', () => {
    expect(calculateTotals([10_000], 0, 0).total).toBe(10_000);
  });

  it('rejects a discount greater than subtotal', () => {
    expect(() => calculateTotals([10_000], 10_001, 0)).toThrow(RangeError);
  });
});
