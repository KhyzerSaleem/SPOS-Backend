import { isPlatformRole } from '../../../common/constants/platform-roles';

/**
 * Roles that manage the business / team — they use HRM admin screens,
 * not employee self-service (clock-in, apply leave).
 */
export const HRM_SELF_SERVICE_EXCLUDED_ROLES = [
  'owner',
  'admin',
  'manager',
  'hr',
  'super_admin',
] as const;

export function isHrmSelfServiceEligible(role: string | undefined): boolean {
  if (!role) return false;
  if (
    HRM_SELF_SERVICE_EXCLUDED_ROLES.includes(
      role as (typeof HRM_SELF_SERVICE_EXCLUDED_ROLES)[number],
    )
  ) {
    return false;
  }
  if (isPlatformRole(role)) return false;
  return true;
}

export function selfServiceIneligibleMessage(role: string): string {
  if (role === 'owner') {
    return 'As the business owner, you approve and manage team leave from HRM → Leaves. Staff members apply for leave from My Workspace.';
  }
  if (role === 'admin' || role === 'manager' || role === 'hr') {
    return 'Your role manages team HR from HRM. Use HRM → Leaves to review requests; only staff accounts apply for leave here.';
  }
  return 'Self-service attendance and leave are available to staff accounts only.';
}
