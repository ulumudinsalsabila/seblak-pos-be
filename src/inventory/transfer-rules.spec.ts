import { UnprocessableEntityException } from '@nestjs/common';
import {
  Prisma,
  StockRequestStatus,
  StockTransferStatus,
} from '@prisma/client';
import {
  applyReceipt,
  inTransit,
  requestStatusForTransfer,
  statusAfterReceipt,
} from './transfer-rules';

const decimal = (value: string | number) => new Prisma.Decimal(value);
const line = (shipped: number, received = 0, lost = 0, quantity = shipped) => ({
  itemId: 'chili',
  quantity: decimal(quantity),
  shippedQuantity: decimal(shipped),
  receivedQuantity: decimal(received),
  lostQuantity: decimal(lost),
});

describe('transfer rules', () => {
  it('keeps a partial receipt reconcilable: shipped = received + in transit', () => {
    const shipped = line(10_000);
    const received = applyReceipt(
      [shipped],
      [{ itemId: 'chili', quantity: decimal(6_000) }],
    ).get('chili')!;
    const after = { ...shipped, receivedQuantity: received };

    expect(received.toString()).toBe('6000');
    expect(inTransit(after).toString()).toBe('4000');
    expect(after.receivedQuantity.plus(inTransit(after)).toString()).toBe(
      shipped.shippedQuantity.toString(),
    );
    expect(statusAfterReceipt([after])).toBe(
      StockTransferStatus.PARTIALLY_RECEIVED,
    );
  });

  it('is received once nothing is left in transit', () => {
    expect(statusAfterReceipt([line(10, 10)])).toBe(
      StockTransferStatus.RECEIVED,
    );
    expect(statusAfterReceipt([line(10, 7, 3)])).toBe(
      StockTransferStatus.RECEIVED,
    );
  });

  it('refuses to receive more than is in transit', () => {
    expect(() =>
      applyReceipt([line(10, 8)], [{ itemId: 'chili', quantity: decimal(3) }]),
    ).toThrow(UnprocessableEntityException);
  });

  it('refuses an item that is not on the transfer', () => {
    expect(() =>
      applyReceipt([line(10)], [{ itemId: 'oil', quantity: decimal(1) }]),
    ).toThrow(UnprocessableEntityException);
  });

  it('derives the request status from its transfer', () => {
    expect(
      requestStatusForTransfer(StockTransferStatus.SHIPPED, [line(10)]),
    ).toBe(StockRequestStatus.APPROVED);
    expect(
      requestStatusForTransfer(StockTransferStatus.PARTIALLY_RECEIVED, [
        line(10, 4),
      ]),
    ).toBe(StockRequestStatus.PARTIALLY_FULFILLED);
    expect(
      requestStatusForTransfer(StockTransferStatus.RECEIVED, [line(10, 10)]),
    ).toBe(StockRequestStatus.FULFILLED);
    // Closed short: some of it was lost in transit.
    expect(
      requestStatusForTransfer(StockTransferStatus.RECEIVED, [line(10, 7, 3)]),
    ).toBe(StockRequestStatus.PARTIALLY_FULFILLED);
    expect(requestStatusForTransfer(StockTransferStatus.CANCELLED, [])).toBe(
      StockRequestStatus.CANCELLED,
    );
  });
});
