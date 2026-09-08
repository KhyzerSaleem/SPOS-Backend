import { Injectable, ExecutionContext, UnauthorizedException, Logger } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { SetMetadata } from '@nestjs/common';
import { JsonWebTokenError, TokenExpiredError } from 'jsonwebtoken';

export const IS_PUBLIC_KEY = 'isPublic';

/** Mark a route as publicly accessible — skips JWT verification entirely. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    // If the route (or its controller) is decorated with @Public(), skip auth
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) return true;

    return super.canActivate(context);
  }

  handleRequest<TUser = any>(
    err: Error | null,
    user: TUser | false,
    info: Error | null,
    _context: ExecutionContext,
  ): TUser {
    if (info instanceof TokenExpiredError) {
      throw new UnauthorizedException('Access token has expired');
    }

    if (info instanceof JsonWebTokenError) {
      throw new UnauthorizedException('Invalid access token');
    }

    if (err || !user) {
      this.logger.warn(
        `[JwtAuthGuard] Auth failed — ${err?.message ?? info?.message ?? 'no token'}`,
      );
      throw new UnauthorizedException('Authentication required');
    }

    return user;
  }
}
