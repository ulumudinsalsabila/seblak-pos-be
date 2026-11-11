import {
  ConflictException,
  ExecutionContext,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  InventoryPermission,
  Prisma,
  Role,
  StockMovementDirection,
  StockMovementType,
  StockTransferStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryAccessService } from './inventory-access.service';
import { InventoryLedgerService } from './inventory-ledger.service';
import { InventoryPermissionsGuard } from './inventory-permissions.guard';
import { StockTransfersService } from './stock-transfers.service';

const decimal = (value: string | number) => new Prisma.Decimal(value);

function setup(
  options: {
    status?: StockTransferStatus;
    received?: number;
    replay?: boolean;
    locationCount?: number;
  } = {},
) {
  const post = jest.fn().mockImplementation(() => ({ unitCost: decimal(40) }));
  const lineUpdate = jest.fn();
  const transferUpdate = jest.fn();
  const requestUpdate = jest.fn();
  const transferCreate = jest.fn().mockResolvedValue({ id: 'transfer-id' });
  const tx = {
    $queryRaw: jest.fn(),
    stockTransfer: {
      findFirst: jest.fn().mockResolvedValue({
        status: options.status ?? StockTransferStatus.SHIPPED,
        requestId: 'request-id',
        sourceLocationId: 'warehouse',
        destinationLocationId: 'outlet',
      }),
      update: transferUpdate,
      create: transferCreate,
      findUniqueOrThrow: jest
        .fn()
        .mockResolvedValue({ id: 'transfer-id', lines: [] }),
    },
    stockTransferLine: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'line-id',
          itemId: 'chili',
          quantity: decimal(10_000),
          shippedQuantity:
            options.status === StockTransferStatus.APPROVED
              ? decimal(0)
              : decimal(10_000),
          unitCost: decimal(40),
          receivedQuantity: decimal(options.received ?? 0),
          lostQuantity: decimal(0),
        },
      ]),
      update: lineUpdate,
    },
    stockRequest: { update: requestUpdate },
    stockMovement: {
      findUnique: jest
        .fn()
        .mockResolvedValue(options.replay ? { id: 'movement-id' } : null),
    },
    stockLocation: {
      count: jest.fn().mockResolvedValue(options.locationCount ?? 2),
    },
    inventoryItem: { count: jest.fn().mockResolvedValue(1) },
    inventoryAuditEvent: { create: jest.fn() },
  };
  const prisma = {
    $transaction: (run: (client: typeof tx) => unknown) => run(tx),
    stockTransfer: {
      findFirst: jest.fn().mockResolvedValue({ id: 'transfer-id', lines: [] }),
      findUnique: jest.fn().mockResolvedValue(null),
    },
  } as unknown as PrismaService;
  const service = new StockTransfersService(prisma, {
    post,
  } as unknown as InventoryLedgerService);
  return {
    service,
    post,
    lineUpdate,
    transferUpdate,
    requestUpdate,
    transferCreate,
  };
}

const receive = (quantity: string) => ({
  clientRequestId: 'receipt-id',
  lines: [{ itemId: 'chili', quantity }],
});

describe('StockTransfersService', () => {
  it('ships stock out of the source at its average cost', async () => {
    const { service, post, lineUpdate, transferUpdate } = setup({
      status: StockTransferStatus.APPROVED,
    });

    await service.ship('tenant-id', 'user-id', 'transfer-id', {}, true);

    expect(post.mock.calls[0][1]).toMatchObject({
      locationId: 'warehouse',
      type: StockMovementType.TRANSFER_SHIPPED,
      direction: StockMovementDirection.OUT,
      idempotencyKey: 'transfer-ship:transfer-id:chili',
    });
    expect(lineUpdate.mock.calls[0][0].data.unitCost).toEqual(decimal(40));
    expect(transferUpdate.mock.calls[0][0].data.status).toBe(
      StockTransferStatus.SHIPPED,
    );
  });

  it('receives part of a shipment into the destination at the shipped cost', async () => {
    const { service, post, lineUpdate, transferUpdate, requestUpdate } =
      setup();

    await service.receive(
      'tenant-id',
      'user-id',
      'transfer-id',
      receive('6000'),
      true,
    );

    expect(post.mock.calls[0][1]).toMatchObject({
      locationId: 'outlet',
      type: StockMovementType.TRANSFER_RECEIVED,
      direction: StockMovementDirection.IN,
      unitCost: decimal(40),
      incomingCostPolicy: 'WEIGHTED_AVERAGE',
      idempotencyKey: 'transfer-receive:transfer-id:receipt-id:chili',
    });
    expect(lineUpdate.mock.calls[0][0].data.receivedQuantity.toString()).toBe(
      '6000',
    );
    expect(transferUpdate.mock.calls[0][0].data.status).toBe(
      StockTransferStatus.PARTIALLY_RECEIVED,
    );
    expect(requestUpdate.mock.calls[0][0].data.status).toBe(
      'PARTIALLY_FULFILLED',
    );
  });

  it('does not receive the same receipt twice', async () => {
    const { service, post, lineUpdate } = setup({ replay: true });

    await service.receive(
      'tenant-id',
      'user-id',
      'transfer-id',
      receive('6000'),
      true,
    );

    expect(post).not.toHaveBeenCalled();
    expect(lineUpdate).not.toHaveBeenCalled();
  });

  it('refuses to receive more than is in transit', async () => {
    const { service, post } = setup({ received: 8_000 });

    await expect(
      service.receive(
        'tenant-id',
        'user-id',
        'transfer-id',
        receive('3000'),
        true,
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(post).not.toHaveBeenCalled();
  });

  it('writes off what is still in transit when receiving is closed', async () => {
    const { service, lineUpdate, transferUpdate } = setup({ received: 7_000 });

    await service.close(
      'tenant-id',
      'user-id',
      'transfer-id',
      { reason: 'Tumpah di jalan' },
      true,
    );

    expect(lineUpdate.mock.calls[0][0].data.lostQuantity.toString()).toBe(
      '3000',
    );
    expect(transferUpdate.mock.calls[0][0].data.status).toBe(
      StockTransferStatus.RECEIVED,
    );
  });

  it('cannot cancel a transfer that already shipped', async () => {
    const { service, transferUpdate } = setup();

    await expect(
      service.cancel(
        'tenant-id',
        'user-id',
        'transfer-id',
        { reason: 'Salah tujuan' },
        true,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(transferUpdate).not.toHaveBeenCalled();
  });

  it('cannot move stock to a location of another tenant', async () => {
    // Location lookups are tenant-scoped, so a foreign location is not found.
    const { service, transferCreate } = setup({ locationCount: 1 });

    await expect(
      service.create(
        'tenant-id',
        'user-id',
        {
          clientRequestId: 'request-id',
          sourceLocationId: 'warehouse',
          destinationLocationId: 'other-tenant-outlet',
          lines: [{ itemId: 'chili', quantity: '1000' }],
        },
        true,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(transferCreate).not.toHaveBeenCalled();
  });
});

describe('transfer authorization', () => {
  const findFirst = jest.fn().mockResolvedValue(null);
  const guard = new InventoryPermissionsGuard(
    {
      getAllAndOverride: () => [
        InventoryPermission.APPROVE_INVENTORY_TRANSFERS,
      ],
    } as unknown as Reflector,
    new InventoryAccessService({
      inventoryPermissionGrant: { findFirst },
    } as unknown as PrismaService),
  );
  const context = (role: Role) =>
    ({
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({
        getRequest: () => ({
          user: { id: 'user-id', role, tenantId: 'tenant-id' },
        }),
      }),
    }) as unknown as ExecutionContext;

  it.each([Role.CASHIER, Role.KITCHEN, Role.MANAGER])(
    'forbids %s from approving or rejecting without a grant',
    async (role) => {
      await expect(guard.canActivate(context(role))).resolves.toBe(false);
    },
  );

  it('allows the owner', async () => {
    await expect(guard.canActivate(context(Role.OWNER))).resolves.toBe(true);
  });
});
