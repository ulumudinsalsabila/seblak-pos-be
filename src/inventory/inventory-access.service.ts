import { Injectable } from '@nestjs/common';
import { InventoryPermission, Role } from '@prisma/client';
import { AuthUser } from '../common/auth-user';
import { PrismaService } from '../prisma/prisma.service';

const ALL_PERMISSIONS = Object.values(InventoryPermission);
const roleDefaults: Partial<Record<Role, InventoryPermission[]>> = {
  [Role.OWNER]: ALL_PERMISSIONS,
  [Role.MANAGER]: [
    InventoryPermission.VIEW_INVENTORY,
    InventoryPermission.VIEW_INVENTORY_COST,
    InventoryPermission.VIEW_INVENTORY_LEDGER,
    InventoryPermission.MANAGE_INVENTORY_ITEMS,
    InventoryPermission.MANAGE_INVENTORY_LOCATIONS,
    InventoryPermission.MANAGE_INVENTORY_RECIPES,
    InventoryPermission.RECEIVE_INVENTORY_PURCHASES,
  ],
  [Role.CASHIER]: [InventoryPermission.VIEW_INVENTORY],
  [Role.KITCHEN]: [InventoryPermission.VIEW_INVENTORY],
};

@Injectable()
export class InventoryAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async has(
    user: AuthUser,
    permission: InventoryPermission,
    locationId?: string,
  ) {
    if (!user.tenantId || user.role === Role.SUPER_ADMIN) return false;
    if (roleDefaults[user.role]?.includes(permission)) return true;
    return Boolean(
      await this.prisma.inventoryPermissionGrant.findFirst({
        where: {
          tenantId: user.tenantId,
          userId: user.id,
          permission,
          OR: [{ scopeKey: 'TENANT' }, ...(locationId ? [{ locationId }] : [])],
        },
        select: { id: true },
      }),
    );
  }
}
