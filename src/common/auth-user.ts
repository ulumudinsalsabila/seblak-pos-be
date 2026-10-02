import { Role } from '@prisma/client';

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
  tenantId: string | null;
  outletId: string | null;
  outletName: string | null;
}
