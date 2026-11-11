import { KitchenStatus, Prisma } from '@prisma/client';
import { optionConsumptionPlans, voidStockAction } from './sale-consumption';

const decimal = (value: string | number) => new Prisma.Decimal(value);

describe('optionConsumptionPlans', () => {
  const rows = [
    {
      id: 'row-level-3',
      groupId: 'level',
      valueId: 'level-3',
      locationId: 'kitchen',
      itemId: 'chili',
      quantity: decimal(15),
    },
    {
      id: 'row-cheese',
      groupId: 'topping',
      valueId: 'cheese',
      locationId: 'kitchen',
      itemId: 'cheese',
      quantity: decimal('20.5'),
    },
  ];

  it('scales each selected option by the quantity sold', () => {
    const plans = optionConsumptionPlans(
      [
        {
          transactionItemId: 'sale-item',
          quantity: 2,
          selectedOptions: [
            {
              groupId: 'level',
              groupName: 'Level',
              valueId: 'level-3',
              valueLabel: 'Level 3',
            },
          ],
        },
      ],
      rows,
      'SBL-1',
    );

    expect(plans).toHaveLength(1);
    expect(plans[0]).toMatchObject({
      itemId: 'chili',
      sourceType: 'SALE_OPTION',
      sourceId: 'sale-item',
      idempotencyKey: 'sale-opt:sale-item:row-level-3',
    });
    expect(plans[0].quantity.toString()).toBe('30');
  });

  it('ignores options with no ingredient mapping', () => {
    expect(
      optionConsumptionPlans(
        [
          {
            transactionItemId: 'sale-item',
            quantity: 1,
            selectedOptions: [
              {
                groupId: 'broth',
                groupName: 'Kuah',
                valueId: 'thick',
                valueLabel: 'Kental',
              },
            ],
          },
        ],
        rows,
        'SBL-1',
      ),
    ).toEqual([]);
  });

  it('does not match a value id from another group', () => {
    expect(
      optionConsumptionPlans(
        [
          {
            transactionItemId: 'sale-item',
            quantity: 1,
            selectedOptions: [
              {
                groupId: 'extra',
                groupName: 'Extra',
                valueId: 'cheese',
                valueLabel: 'Keju',
              },
            ],
          },
        ],
        rows,
        'SBL-1',
      ),
    ).toEqual([]);
  });
});

describe('voidStockAction', () => {
  it('returns packaged goods to stock even after the kitchen completed the order', () => {
    expect(voidStockAction('SALE_DIRECT', KitchenStatus.COMPLETED)).toBe(
      'RESTORE',
    );
  });

  it('returns ingredients of a dish the kitchen has not completed', () => {
    expect(voidStockAction('SALE_RECIPE', KitchenStatus.PENDING)).toBe(
      'RESTORE',
    );
    expect(voidStockAction('SALE_OPTION', KitchenStatus.PENDING)).toBe(
      'RESTORE',
    );
  });

  it('records ingredients of a completed dish as waste', () => {
    expect(voidStockAction('SALE_RECIPE', KitchenStatus.COMPLETED)).toBe(
      'WASTE',
    );
    expect(voidStockAction('SALE_OPTION', KitchenStatus.COMPLETED)).toBe(
      'WASTE',
    );
  });
});
