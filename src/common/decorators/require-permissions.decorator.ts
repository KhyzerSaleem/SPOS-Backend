import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';
export const FEATURE_KEY = 'feature';

export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

export const RequireFeature = (feature: string) => SetMetadata(FEATURE_KEY, feature);
