import { INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { MaintenanceGuard } from '../common/guards/maintenance.guard';

/**
 * Global guards — applied to every route in this order:
 *   1. JwtAuthGuard      — verifies token; @Public() opts out
 *   2. MaintenanceGuard  — platform maintenance mode
 *   3. PermissionsGuard  — checks effectivePermissions; @RequirePermissions() opts in
 *   4. SubscriptionGuard — checks tenant subscription; @Public() opts out
 */
export function setupGlobalGuards(app: INestApplication): void {
  const reflector = app.get(Reflector);
  app.useGlobalGuards(
    new JwtAuthGuard(reflector),
    app.get(MaintenanceGuard),
    new PermissionsGuard(reflector),
    app.get(SubscriptionGuard),
  );
}
