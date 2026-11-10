import { InventoryPermission, Role } from '@prisma/client';
import { AuthUser } from '../common/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryAccessService } from './inventory-access.service';

const user = (role: Role, tenantId: string | null = 'tenant-id'): AuthUser => ({
  id: 'user-id',
  email: 'user@dagora.app',
  role,
  tenantId,
  outletId: tenantId ? 'outlet-id' : null,
  outletName: tenantId ? 'Outlet' : null,
});

describe('InventoryAccessService', () => {
  const findFirst = jest.fn();
  const service = new InventoryAccessService({
    inventoryPermissionGrant: { findFirst },
  } as unknown as PrismaService);

  beforeEach(() => findFirst.mockReset());

  it('grants owners every inventory permission by default', async () => {
    await expect(
      service.has(user(Role.OWNER), InventoryPermission.POST_INVENTORY_OPENING),
    ).resolves.toBe(true);
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('does not grant managers opening-balance permission implicitly', async () => {
    findFirst.mockResolvedValue(null);
    await expect(
      service.has(
        user(Role.MANAGER),
        InventoryPermission.POST_INVENTORY_OPENING,
      ),
    ).resolves.toBe(false);
  });

  it('allows an explicit tenant permission grant', async () => {
    findFirst.mockResolvedValue({ id: 'grant-id' });
    await expect(
      service.has(
        user(Role.KITCHEN),
        InventoryPermission.VIEW_INVENTORY_LEDGER,
      ),
    ).resolves.toBe(true);
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-id',
        userId: 'user-id',
        permission: InventoryPermission.VIEW_INVENTORY_LEDGER,
        OR: [{ scopeKey: 'TENANT' }],
      },
      select: { id: true },
    });
  });

  it('never gives super admin automatic tenant inventory access', async () => {
    await expect(
      service.has(
        user(Role.SUPER_ADMIN, null),
        InventoryPermission.VIEW_INVENTORY,
      ),
    ).resolves.toBe(false);
    expect(findFirst).not.toHaveBeenCalled();
  });
});
