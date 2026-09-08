import { SetMetadata } from '@nestjs/common';

export const OPTIONAL_STORE_KEY = 'optionalStore';

/**
 * When applied to a route handler or controller, StoreGuard will NOT fail if
 * the X-Store-Id header is omitted (tenant-level operations like Roles, API keys, etc.).
 * If X-Store-Id IS provided, it will still validate and attach it to the request.
 */
export const OptionalStore = () => SetMetadata(OPTIONAL_STORE_KEY, true);
