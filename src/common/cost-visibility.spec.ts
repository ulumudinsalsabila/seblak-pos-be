import { Prisma, Role } from '@prisma/client';
import { hideCost } from './cost-visibility';

describe('hideCost', () => {
  const transaction = {
    id: 't1',
    paidAt: new Date('2026-11-10T03:00:00.000Z'),
    taxPercentage: new Prisma.Decimal('11.00'),
    items: [
      { id: 'i1', unitPrice: 15000, unitCost: 9000, costSubtotal: 18000 },
    ],
  };

  it('keeps cost for owners and managers', () => {
    expect(hideCost(transaction, Role.OWNER)).toBe(transaction);
    expect(hideCost(transaction, Role.MANAGER)).toBe(transaction);
  });

  it('removes nested cost fields for cashiers and kitchen', () => {
    for (const role of [Role.CASHIER, Role.KITCHEN]) {
      const result = hideCost({ data: [transaction], meta: null }, role);
      expect(result.data[0].items[0]).toEqual({ id: 'i1', unitPrice: 15000 });
    }
  });

  it('leaves Date and Decimal values intact', () => {
    const result = hideCost(transaction, Role.CASHIER);
    expect(result.paidAt).toBeInstanceOf(Date);
    expect(result.taxPercentage).toBeInstanceOf(Prisma.Decimal);
    expect(JSON.stringify(result.taxPercentage)).toBe('"11"');
  });
});
