import { FeeType } from '@prisma/client';
import { calculatePlatformFee } from './fees';

describe('calculatePlatformFee', () => {
  it.each([
    [FeeType.NONE, 100_000, 2_000, 2.5, 0],
    [FeeType.FIXED, 100_000, 2_000, 2.5, 2_000],
    [FeeType.PERCENTAGE, 100_000, 2_000, 2.5, 2_500],
    [FeeType.HYBRID, 100_000, 2_000, 2.5, 4_500],
  ])('calculates %s fee', (type, total, fixed, percentage, expected) => {
    expect(calculatePlatformFee(total, type, fixed, percentage).amount).toBe(
      expected,
    );
  });
});
