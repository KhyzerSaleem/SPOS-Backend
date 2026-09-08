import { INestApplication, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as cookieParser from 'cookie-parser';
import { parseAllowedOrigins, createCorsOptions } from '../config/cors.config';
import { createHelmetMiddleware } from '../config/helmet.config';
import { createValidationPipe } from '../config/validation.config';
import { isSwaggerEnabled, setupSwagger } from '../config/swagger.config';
import { API_GLOBAL_PREFIX } from '../config/app.constants';
import { requestIdMiddleware } from '../common/middleware/request-id.middleware';
import { setupBodyParser } from './body-parser.setup';
import { setupGlobalGuards } from './global-guards.setup';

const logger = new Logger('Bootstrap');

export interface ApplicationSetupResult {
  swaggerEnabled: boolean;
}

export function setupApplication(app: INestApplication): ApplicationSetupResult {
  setupBodyParser(app);

  app.setGlobalPrefix(API_GLOBAL_PREFIX);

  app.use(createHelmetMiddleware());
  app.use(cookieParser());
  app.use(requestIdMiddleware);

  const configService = app.get(ConfigService);
  const allowedOrigins = parseAllowedOrigins(configService.get<string>('FRONTEND_URL'));
  app.enableCors(createCorsOptions(allowedOrigins));

  app.useGlobalPipes(createValidationPipe());
  setupGlobalGuards(app);

  const swaggerEnabled = isSwaggerEnabled(
    configService.get<string>('NODE_ENV'),
    configService.get<string>('ENABLE_SWAGGER'),
  );
  if (swaggerEnabled) {
    setupSwagger(app);
    logger.log('Swagger documentation enabled');
  }

  return { swaggerEnabled };
}
