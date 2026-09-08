/** Platform (SaaS operator) roles — users with tenantId = null */
export const PLATFORM_ROLES = [
  'super_admin',
  'platform_admin',
  'platform_sales',
  'platform_support',
  'platform_billing',
  'platform_hr',
] as const;

export type PlatformRole = (typeof PLATFORM_ROLES)[number];

export const PLATFORM_ROLE_PERMISSIONS: Record<string, string[]> = {
  super_admin: ['*'],
  platform_admin: [
    'admin.dashboard',
    'admin.tenants.view',
    'admin.tenants.manage',
    'admin.users.view',
    'admin.users.manage',
    'admin.plans.view',
    'admin.plans.manage',
    'admin.billing.view',
    'admin.support.view',
    'admin.support.manage',
    'admin.team.view',
    'admin.blog.view',
    'admin.blog.manage',
  ],
  platform_sales: ['admin.dashboard', 'admin.tenants.view', 'admin.users.view'],
  platform_support: [
    'admin.dashboard',
    'admin.tenants.view',
    'admin.support.view',
    'admin.support.manage',
  ],
  platform_billing: [
    'admin.dashboard',
    'admin.tenants.view',
    'admin.plans.view',
    'admin.plans.manage',
    'admin.billing.view',
  ],
  platform_hr: ['admin.dashboard', 'admin.team.view'],
};

/** Destructive SaaS-owner actions. The guard keeps these super-admin only. */
export const PLATFORM_SENSITIVE_PERMISSIONS = [
  'admin.tenants.delete',
  'admin.tenants.impersonate',
  'admin.users.reset_password',
  'admin.system.manage',
  'admin.team.manage',
] as const;

export function isPlatformRole(role: string | undefined): boolean {
  return !!role && PLATFORM_ROLES.includes(role as PlatformRole);
}

export function getPlatformPermissions(role: string): string[] {
  return PLATFORM_ROLE_PERMISSIONS[role] ?? [];
}

export function hasPlatformPermission(role: string, permission: string): boolean {
  const perms = getPlatformPermissions(role);
  return perms.includes('*') || perms.includes(permission);
}
