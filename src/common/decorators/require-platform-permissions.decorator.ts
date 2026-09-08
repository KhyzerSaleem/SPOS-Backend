import { SetMetadata } from '@nestjs/common';

export const PLATFORM_PERMISSIONS_KEY = 'platform_permissions';

/** Require platform-panel permissions (SaaS operator roles). ALL listed permissions must be present. */
export const RequirePlatformPermissions = (...permissions: string[]) =>
  SetMetadata(PLATFORM_PERMISSIONS_KEY, permissions);
