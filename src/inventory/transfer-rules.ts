import { UnprocessableEntityException } from '@nestjs/common';
import {
  Prisma,
  StockRequestStatus,
  StockTransferStatus,
} from '@prisma/client';

type TransferLineState = {
  itemId: string;
  quantity: Prisma.Decimal;
  shippedQuantity: Prisma.Decimal;
  receivedQuantity: Prisma.Decimal;
  lostQuantity: Prisma.Decimal;
};

/** Shipped quantity still in transit: neither received nor written off. */
export function inTransit(line: TransferLineState) {
  return line.shippedQuantity
    .minus(line.receivedQuantity)
    .minus(line.lostQuantity);
}

/**
 * Received quantity per item after a receipt. Each incoming quantity must be positive, belong to the transfer
 * and fit what is still in transit.
 */
export function applyReceipt(
  lines: TransferLineState[],
  incoming: Array<{ itemId: string; quantity: Prisma.Decimal }>,
) {
  if (new Set(incoming.map((line) => line.itemId)).size !== incoming.length)
    throw new UnprocessableEntityException(
      'A receipt cannot contain the same item twice',
    );
  const lineMap = new Map(lines.map((line) => [line.itemId, line]));
  return new Map(
    incoming.map((receipt, index) => {
      const line = lineMap.get(receipt.itemId);
      if (!line)
        throw new UnprocessableEntityException(
          `Line ${index + 1} is not part of this transfer`,
        );
      if (receipt.quantity.lte(0))
        throw new UnprocessableEntityException(
          `Received quantity must be greater than zero for line ${index + 1}`,
        );
      if (receipt.quantity.gt(inTransit(line)))
        throw new UnprocessableEntityException({
          code: 'TRANSFER_OVER_RECEIPT',
          message: `Line ${index + 1} receives more than is in transit (${inTransit(line).toString()})`,
        });
      return [
        receipt.itemId,
        line.receivedQuantity.plus(receipt.quantity),
      ] as const;
    }),
  );
}

/** RECEIVED once nothing is left in transit, otherwise PARTIALLY_RECEIVED. */
export function statusAfterReceipt(lines: TransferLineState[]) {
  return lines.every((line) => inTransit(line).lte(0))
    ? StockTransferStatus.RECEIVED
    : StockTransferStatus.PARTIALLY_RECEIVED;
}

/** Status a request takes from the transfer created for it. */
export function requestStatusForTransfer(
  status: StockTransferStatus,
  lines: TransferLineState[],
): StockRequestStatus {
  if (status === StockTransferStatus.CANCELLED)
    return StockRequestStatus.CANCELLED;
  if (status === StockTransferStatus.PARTIALLY_RECEIVED)
    return StockRequestStatus.PARTIALLY_FULFILLED;
  if (status === StockTransferStatus.RECEIVED)
    return lines.every((line) => line.receivedQuantity.gte(line.quantity))
      ? StockRequestStatus.FULFILLED
      : StockRequestStatus.PARTIALLY_FULFILLED;
  return StockRequestStatus.APPROVED;
}
