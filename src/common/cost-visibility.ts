import { Role } from '@prisma/client';

const COST_FIELDS = new Set(['unitCost', 'costSubtotal']);

export function canSeeCost(role: Role) {
  return role === Role.OWNER || role === Role.MANAGER;
}

/**
 * Removes product/transaction cost (HPP) fields from a response for roles
 * that may not see them (cashier, kitchen). Walks nested arrays and objects.
 */
export function hideCost<T>(value: T, role: Role): T {
  if (canSeeCost(role)) return value;
  return strip(value) as T;
}

function strip(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(strip);
  // Only plain objects: Date and Prisma.Decimal must keep their own toJSON.
  if (!value || Object.getPrototypeOf(value) !== Object.prototype) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !COST_FIELDS.has(key))
      .map(([key, item]) => [key, strip(item)]),
  );
}
