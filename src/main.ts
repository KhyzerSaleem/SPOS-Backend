import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AppModule } from './app.module';
import { AuthService } from './modules/auth/auth.service';
import { setupApplication } from './bootstrap/setup-application';
import { DEFAULT_PORT, SWAGGER_PATH } from './config/app.constants';

const logger = new Logger('Bootstrap');

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug'],
    bodyParser: false,
  });

  const { swaggerEnabled } = setupApplication(app);

  try {
    const authService = app.get(AuthService);
    await authService.syncDefaultRoles();
    logger.log('Default roles synced successfully');
  } catch (err) {
    logger.error('Failed to sync default roles on startup', err instanceof Error ? err.stack : err);
  }

  app.enableShutdownHooks();

  const configService = app.get(ConfigService);
  const port = configService.get<string>('PORT') ?? String(DEFAULT_PORT);
  await app.listen(port);

  logger.log(`Server running on http://localhost:${port}`);
  if (swaggerEnabled) {
    logger.log(`Swagger docs at http://localhost:${port}/${SWAGGER_PATH}`);
  }
}

bootstrap().catch((err) => {
  logger.error('Fatal error during bootstrap', err instanceof Error ? err.stack : err);
  process.exit(1);
});
