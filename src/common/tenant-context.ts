import { ForbiddenException } from '@nestjs/common';
import { AuthUser } from './auth-user';

export function requireTenant(user: AuthUser): string {
  if (!user.tenantId) {
    throw new ForbiddenException('An active tenant is required');
  }
  return user.tenantId;
}
