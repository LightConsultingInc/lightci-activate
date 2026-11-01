import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

/** Problem-details style error body so the frontend can render one consistent toast. */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Http');

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const body =
      exception instanceof HttpException ? exception.getResponse() : null;
    // OAuth 2.0 errors (RFC 6749 §5.2) keep their own shape: clients key on `error`.
    if (
      body &&
      typeof body === 'object' &&
      typeof (body as { error?: unknown }).error === 'string' &&
      typeof (body as { error_description?: unknown }).error_description ===
        'string'
    ) {
      res.status(status).json(body);
      return;
    }
    const detail =
      typeof body === 'string'
        ? body
        : body && typeof body === 'object' && 'message' in body
          ? Array.isArray(body.message)
            ? (body as { message: string[] }).message.join(' ')
            : String(body.message)
          : exception instanceof Error
            ? exception.message
            : 'Unexpected error';
    if (status >= 500)
      this.logger.error(
        exception instanceof Error ? exception.stack : String(exception),
      );
    res
      .status(status)
      .json({ status, title: HttpStatus[status] ?? 'Error', detail });
  }
}
