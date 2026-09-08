import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import { Logger } from '@nestjs/common';

const logger = new Logger('CorsConfig');

const VERCEL_PREVIEW_ORIGIN = /^https:\/\/[\w.-]+\.vercel\.app$/;

export function parseAllowedOrigins(rawOrigins: string | undefined): string[] {
  return (rawOrigins ?? 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function createCorsOptions(allowedOrigins: string[]): CorsOptions {
  logger.log(`CORS allowed origins: ${allowedOrigins.join(', ') || '(none)'}`);

  return {
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin) || VERCEL_PREVIEW_ORIGIN.test(origin)) {
        callback(null, true);
      } else {
        logger.warn(`CORS blocked origin: ${origin}`);
        callback(null, false);
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Store-Id', 'X-API-Key'],
  };
}
