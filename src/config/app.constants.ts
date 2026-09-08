/** Global API route prefix applied in bootstrap. */
export const API_GLOBAL_PREFIX = 'api';

/** Swagger UI mount path (relative to global prefix). */
export const SWAGGER_PATH = 'api/docs';

/** Default HTTP port when PORT env var is unset. */
export const DEFAULT_PORT = 5000;

/** Max JSON/urlencoded body size. */
export const BODY_PARSER_LIMIT = '2mb';

/** Stripe webhook path fragment used to attach rawBody. */
export const STRIPE_WEBHOOK_PATH = '/webhooks/stripe';
