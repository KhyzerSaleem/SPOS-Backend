import { INestApplication } from '@nestjs/common';
import { json, urlencoded } from 'express';
import { Request } from 'express';
import { BODY_PARSER_LIMIT, STRIPE_WEBHOOK_PATH } from '../config/app.constants';

export function setupBodyParser(app: INestApplication): void {
  app.use(
    json({
      limit: BODY_PARSER_LIMIT,
      verify: (req: Request, _res, buf) => {
        if (typeof req.url === 'string' && req.url.includes(STRIPE_WEBHOOK_PATH)) {
          req.rawBody = buf;
        }
      },
    }),
  );
  app.use(urlencoded({ extended: true, limit: BODY_PARSER_LIMIT }));
}
