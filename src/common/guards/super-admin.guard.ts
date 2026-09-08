import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { isPlatformRole } from '../constants/platform-roles';

@Injectable()
export class SuperAdminGuard implements CanActivate {
  private readonly logger = new Logger(SuperAdminGuard.name);

  canActivate(context: ExecutionContext): true {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || !isPlatformRole(user.role)) {
      this.logger.warn(
        `[SuperAdminGuard] Unauthorized access attempt — ` +
          `user: ${user?.sub ?? 'unauthenticated'}, role: ${user?.role ?? 'none'}, ` +
          `path: ${request.url}`,
      );
      throw new ForbiddenException('Super admin access required');
    }

    return true;
  }
}
