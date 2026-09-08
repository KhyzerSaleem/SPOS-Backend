import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  SetMetadata,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from './jwt-auth.guard';
import { isPlatformRole } from '../constants/platform-roles';
import { tenantHasFeatureAccess } from '../constants/plan-features';

export const PERMISSIONS_KEY = 'permissions';
export const FEATURE_KEY = 'feature';

/** Declare one or more permissions required to access a route. ALL must be present. */
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

/** Declare a feature-flag key that must be present in the tenant's featureAccess list. */
export const RequireFeature = (feature: string) => SetMetadata(FEATURE_KEY, feature);

@Injectable()
export class PermissionsGuard implements CanActivate {
  private readonly logger = new Logger(PermissionsGuard.name);

  constructor(private reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Public routes (login, signup, etc.) must skip RBAC entirely
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const requiredFeature = this.reflector.getAllAndOverride<string>(FEATURE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // No RBAC metadata — allow (JwtAuthGuard already enforced auth when needed)
    if ((!requiredPermissions || requiredPermissions.length === 0) && !requiredFeature) {
      return true;
    }

    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    if (user.role === 'super_admin') {
      this.logger.debug(`[PermissionsGuard] super_admin bypass — user: ${user.sub}`);
      return true;
    }
    // Platform operators must impersonate a tenant — never bypass tenant RBAC from admin JWT.
    if (isPlatformRole(user.role) && !user.tenantId) {
      this.logger.warn(
        `[PermissionsGuard] Blocked platform API access without tenant context — user: ${user.sub}, role: ${user.role}`,
      );
      throw new ForbiddenException(
        'Platform operators cannot access tenant APIs directly. Use tenant impersonation.',
      );
    }

    // -------------------------------------------------------------------------
    // 1. Feature-flag check (tenant-level gate, applies to every role)
    // -------------------------------------------------------------------------
    if (requiredFeature && user.tenantId) {
      const featureAccess: string[] = user.featureAccess ?? [];
      const plan: string = user.plan ?? 'basic';
      if (!tenantHasFeatureAccess(plan, featureAccess, requiredFeature)) {
        this.logger.warn(
          `[PermissionsGuard] Tenant ${user.tenantId} does not have feature: ${requiredFeature}`,
        );
        throw new ForbiddenException(
          `Your plan does not include the '${requiredFeature}' feature. Upgrade your plan to access this module.`,
        );
      }
    }

    // -------------------------------------------------------------------------
    // 2. Permission check (role + user-level overrides, resolved at login)
    // -------------------------------------------------------------------------
    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    if (user.role === 'owner') {
      return true;
    }

    // effectivePermissions is pre-resolved in the JWT by auth.service.ts
    // (role permissions ∪ user-level overrides), so no DB call is needed here.
    const effectivePermissions: string[] = user.effectivePermissions ?? user.permissions ?? [];

    // Wildcard grants everything (owner role, or any custom role with ['*'])
    if (effectivePermissions.includes('*')) {
      this.logger.debug(`[PermissionsGuard] Wildcard permission — user: ${user.sub}`);
      return true;
    }

    const missing = requiredPermissions.filter((p) => !effectivePermissions.includes(p));

    if (missing.length > 0) {
      this.logger.warn(
        `[PermissionsGuard] User ${user.sub} (tenant: ${user.tenantId}) ` +
          `missing permissions: [${missing.join(', ')}]`,
      );
      throw new ForbiddenException(
        `You do not have the required permissions: ${missing.join(', ')}`,
      );
    }

    return true;
  }
}
