import 'express-serve-static-core';

declare module 'express-serve-static-core' {
  interface Request {
    /** Raw request body buffer — set by body-parser verify callback for Stripe webhooks. */
    rawBody?: Buffer;
    /** Correlation ID propagated via X-Request-Id header. */
    requestId?: string;
  }
}
