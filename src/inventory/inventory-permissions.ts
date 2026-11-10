import { SetMetadata } from '@nestjs/common';
import { InventoryPermission } from '@prisma/client';

export const INVENTORY_PERMISSIONS_KEY = 'inventory-permissions';
export const InventoryPermissions = (...permissions: InventoryPermission[]) =>
  SetMetadata(INVENTORY_PERMISSIONS_KEY, permissions);
