import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response, Request } from 'express';
import { duplicateKeyMessage, parseDuplicateKeyError } from '../utils/duplicate-key.util';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let code: string | undefined;
    let estimate: string | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exResponse = exception.getResponse();
      if (typeof exResponse === 'string') {
        message = exResponse;
      } else if (typeof exResponse === 'object' && exResponse !== null) {
        const res = exResponse as Record<string, unknown>;
        message = (res.message as string | string[]) || exception.message;
        if (typeof res.code === 'string') code = res.code;
        if (typeof res.estimate === 'string') estimate = res.estimate;
      }
    } else if (exception instanceof Error) {
      const parserStatus =
        (exception as { status?: number; statusCode?: number }).status ??
        (exception as { statusCode?: number }).statusCode;
      const parserType = (exception as { type?: string }).type;
      const mongoCode = (exception as { code?: number }).code;
      if (parserStatus === HttpStatus.PAYLOAD_TOO_LARGE || parserType === 'entity.too.large') {
        status = HttpStatus.PAYLOAD_TOO_LARGE;
        message =
          'The uploaded settings payload is too large. Use a smaller logo image or an image URL.';
      } else if (parserStatus === HttpStatus.BAD_REQUEST || parserType === 'entity.parse.failed') {
        status = HttpStatus.BAD_REQUEST;
        message = 'Invalid request body. Please check the settings data and try again.';
      } else if (mongoCode === 11000) {
        status = HttpStatus.CONFLICT;
        message = duplicateKeyMessage(exception);
        // Always log the full key: without this a duplicate-key bug is
        // undiagnosable, since the response deliberately hides tenant/store ids.
        const info = parseDuplicateKeyError(exception);
        this.logger.warn(
          `[${request.requestId || 'no-id'}] ${request.method} ${request.url} → 409 duplicate key` +
            ` index=${info.indexName ?? 'unknown'}` +
            ` key=${JSON.stringify(info.rawKey)}`,
        );
      } else {
        message = exception.message;
        this.logger.error(`Unhandled error: ${exception.message}`, exception.stack);
      }
    }

    if (status >= 500) {
      this.logger.error(
        `[${request.requestId || 'no-id'}] ${request.method} ${request.url} → ${status}: ${message}`,
      );
      message = 'Internal server error';
    }

    response.status(status).json({
      statusCode: status,
      message,
      ...(code && { code }),
      ...(estimate && { estimate }),
      path: request.url,
      requestId: request.requestId,
      timestamp: new Date().toISOString(),
    });
  }
}
