import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PLATFORM_PERMISSIONS_KEY } from '../decorators/require-platform-permissions.decorator';
import { PLATFORM_SENSITIVE_PERMISSIONS } from '../constants/platform-roles';

const SENSITIVE_PLATFORM_PERMISSIONS = new Set<string>(PLATFORM_SENSITIVE_PERMISSIONS);

@Injectable()
export class PlatformPermissionGuard implements CanActivate {
  private readonly logger = new Logger(PlatformPermissionGuard.name);

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(PLATFORM_PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required?.length) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const effectivePermissions: string[] = user?.effectivePermissions ?? [];
    const sensitive = required.filter((p) => SENSITIVE_PLATFORM_PERMISSIONS.has(p));

    if (sensitive.length > 0 && user?.role !== 'super_admin') {
      this.logger.warn(
        `[PlatformPermissionGuard] Blocked sensitive platform permission for ` +
          `${user?.sub ?? 'unknown'} (${user?.role}) required=[${sensitive.join(', ')}] path=${request.url}`,
      );
      throw new ForbiddenException('This sensitive platform action requires super admin access');
    }

    if (effectivePermissions.includes('*')) return true;

    const missing = required.filter((p) => !effectivePermissions.includes(p));
    if (missing.length > 0) {
      this.logger.warn(
        `[PlatformPermissionGuard] User ${user?.sub ?? 'unknown'} (${user?.role}) ` +
          `missing: [${missing.join(', ')}] path=${request.url}`,
      );
      throw new ForbiddenException(
        `You do not have the required platform permissions: ${missing.join(', ')}`,
      );
    }

    return true;
  }
}
