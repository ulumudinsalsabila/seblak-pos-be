import { ForbiddenException } from '@nestjs/common';
import { AuthUser } from './auth-user';

export function requireOutlet(user: AuthUser): string {
  if (!user.outletId) {
    throw new ForbiddenException('An active outlet is required');
  }
  return user.outletId;
}
