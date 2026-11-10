import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InventoryPermission } from '@prisma/client';
import { AuthUser } from '../common/auth-user';
import { InventoryAccessService } from './inventory-access.service';
import { INVENTORY_PERMISSIONS_KEY } from './inventory-permissions';

@Injectable()
export class InventoryPermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly access: InventoryAccessService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const permissions = this.reflector.getAllAndOverride<InventoryPermission[]>(
      INVENTORY_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!permissions?.length) return true;
    const user = context.switchToHttp().getRequest<{ user: AuthUser }>().user;
    if (!user) return false;
    const checks = await Promise.all(
      permissions.map((permission) => this.access.has(user, permission)),
    );
    return checks.every(Boolean);
  }
}
