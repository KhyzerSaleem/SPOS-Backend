import { plainToInstance } from 'class-transformer';
import { IsIn, IsOptional, IsString, MinLength, validateSync } from 'class-validator';

class EnvironmentVariables {
  @IsString()
  DATABASE_URL: string;

  @IsString()
  @MinLength(16)
  JWT_SECRET: string;

  @IsOptional()
  @IsString()
  JWT_EXPIRATION?: string;

  @IsOptional()
  @IsString()
  FRONTEND_URL?: string;

  @IsOptional()
  @IsString()
  STRIPE_SECRET_KEY?: string;

  @IsOptional()
  @IsString()
  STRIPE_WEBHOOK_SECRET?: string;

  @IsOptional()
  @IsString()
  ADMIN_SECRET?: string;

  @IsOptional()
  @IsString()
  ENCRYPTION_KEY?: string;

  // Intentionally optional with no production requirement — QueueService reads
  // this and falls back to direct/inline processing when it's unset, so a
  // missing REDIS_URL degrades functionality (no queueing/retry) rather than
  // crash-looping the app the way an unconditionally-required var would.
  @IsOptional()
  @IsString()
  REDIS_URL?: string;

  @IsOptional()
  @IsIn(['development', 'production', 'test'])
  NODE_ENV?: string;

  @IsOptional()
  @IsString()
  PORT?: string;

  @IsOptional()
  @IsString()
  ENABLE_SWAGGER?: string;
}

export function validateEnv(config: Record<string, unknown>) {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    const messages = errors.flatMap((e) => Object.values(e.constraints ?? {})).join('; ');
    throw new Error(`Environment validation failed: ${messages}`);
  }

  if (validated.NODE_ENV === 'production') {
    if (validated.JWT_SECRET === 'change-me-in-production') {
      throw new Error('JWT_SECRET must be changed in production');
    }
    // ADMIN_SECRET gates emergency account unlock and super-admin creation.
    // It is optional (those endpoints fail closed when unset), but shipping the
    // well-known placeholder — which is published in .env.example — would let
    // anyone unlock accounts or mint a super-admin. Reject it outright.
    if (validated.ADMIN_SECRET === 'change-me-in-production') {
      throw new Error(
        'ADMIN_SECRET must be changed in production (or left unset to disable admin bootstrap endpoints)',
      );
    }
    if (validated.ADMIN_SECRET && validated.ADMIN_SECRET.length < 16) {
      throw new Error('ADMIN_SECRET must be at least 16 characters when set');
    }
    // ENCRYPTION_KEY protects tenant secrets at rest (email provider API keys,
    // SMTP passwords). Without this check the app would silently fall back to a
    // fixed key embedded in source (see settings.service.ts encrypt()) — anyone
    // with read access to the repository could then decrypt every tenant's
    // stored credentials from a database dump. Require it explicitly in prod.
    if (!validated.ENCRYPTION_KEY || validated.ENCRYPTION_KEY.length < 32) {
      throw new Error('ENCRYPTION_KEY must be set to at least 32 characters in production');
    }
  }

  return validated;
}
