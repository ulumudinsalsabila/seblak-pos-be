export function calculateTotals(
  itemSubtotals: number[],
  discount: number,
  taxPercentage: number,
) {
  const subtotal = itemSubtotals.reduce((sum, value) => sum + value, 0);
  if (!Number.isInteger(discount) || discount < 0 || discount > subtotal) {
    throw new RangeError(
      'Discount must be an integer between zero and subtotal',
    );
  }
  const taxableTotal = subtotal - discount;
  const tax = Math.round((taxableTotal * taxPercentage) / 100);
  return { subtotal, discount, taxableTotal, tax, total: taxableTotal + tax };
}
