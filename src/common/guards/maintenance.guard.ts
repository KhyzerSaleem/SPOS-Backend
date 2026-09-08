import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from './jwt-auth.guard';
import { PlatformSettingsService } from '../../modules/admin/platform-settings.service';
import { isPlatformRole } from '../constants/platform-roles';

/** Normalize Express/Nest request path (global prefix, proxies, query strings). */
function getRequestPath(request: { originalUrl?: string; url?: string; path?: string }): string {
  const raw = request.originalUrl ?? request.url ?? request.path ?? '';
  return raw.split('?')[0].replace(/\/+$/, '') || '/';
}

/** Paths that stay reachable during maintenance (even for authenticated tenants). */
function isMaintenanceExemptPath(path: string): boolean {
  if (!path) return false;

  if (path.includes('/public/site-settings')) return true;

  if (path === '/api/health' || path === '/health' || path.endsWith('/health')) {
    return true;
  }

  return false;
}

@Injectable()
export class MaintenanceGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly platformSettings: PlatformSettingsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const path = getRequestPath(request);

    if (isMaintenanceExemptPath(path)) {
      return true;
    }

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const user = request.user;
    if (isPublic && !user) return true;

    const maintenance = await this.platformSettings.getMaintenanceState();
    if (!maintenance.active) return true;

    if (user?.role && isPlatformRole(user.role)) return true;

    throw new ServiceUnavailableException({
      statusCode: 503,
      message: maintenance.message,
      code: 'MAINTENANCE_MODE',
      estimate: maintenance.estimate,
      apologyMessage: maintenance.apologyMessage,
      scheduledStart: maintenance.scheduledStart,
      scheduledEnd: maintenance.scheduledEnd,
      timezone: maintenance.timezone,
    });
  }
}
