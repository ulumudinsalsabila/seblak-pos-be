import { FeeType } from '@prisma/client';

export function calculatePlatformFee(
  total: number,
  type: FeeType,
  configuredFixed: number,
  configuredPercentage: number,
) {
  const fixedFee =
    type === FeeType.FIXED || type === FeeType.HYBRID ? configuredFixed : 0;
  const percentage =
    type === FeeType.PERCENTAGE || type === FeeType.HYBRID
      ? configuredPercentage
      : 0;
  return {
    fixedFee,
    percentage,
    amount: fixedFee + Math.round((total * percentage) / 100),
  };
}
