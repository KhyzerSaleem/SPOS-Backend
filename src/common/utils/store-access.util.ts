/** Stores a user may access: owners/admins see all; staff only assigned storeAccess IDs. */
export function filterStoresForUser<T extends { _id: string }>(
  stores: T[],
  user: { role?: string; storeAccess?: string[] },
): T[] {
  if (user?.role === 'owner' || user?.role === 'admin') {
    return stores;
  }
  const access = new Set((user?.storeAccess ?? []).map(String).filter(Boolean));
  if (access.size === 0) {
    return [];
  }
  return stores.filter((s) => access.has(String(s._id)));
}

export function userHasUnrestrictedStoreAccess(role?: string): boolean {
  return role === 'owner' || role === 'admin';
}
