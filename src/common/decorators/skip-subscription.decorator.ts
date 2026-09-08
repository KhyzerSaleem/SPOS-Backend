import { SetMetadata } from '@nestjs/common';

export const SKIP_SUBSCRIPTION_KEY = 'skipSubscription';

/** Allow route when tenant subscription is expired (e.g. billing, auth/me). */
export const SkipSubscription = () => SetMetadata(SKIP_SUBSCRIPTION_KEY, true);
