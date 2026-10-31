import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { isProduction } from '../config/env';
import { HEALTH_PATHS } from '../healthcheck/paths';

/**
 * JSON lines on stdout: time, level, msg, requestId (and the Nest context name).
 * Headers are never serialised, so bearer tokens and cookies cannot leak; prompt and
 * response content is never passed to the logger by any service. Locally the same
 * stream is pretty-printed.
 */
@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? (isProduction() ? 'info' : 'debug'),
        // main.ts assigns req.id from X-Request-Id or a fresh UUID before Nest runs.
        genReqId: (req) => (req as IncomingMessage & { id?: string }).id ?? '',
        customProps: (req) => ({
          requestId: (req as IncomingMessage & { id?: string }).id,
        }),
        autoLogging: {
          ignore: (req) => HEALTH_PATHS.has((req.url ?? '').split('?')[0]),
        },
        serializers: {
          req: (req: IncomingMessage & { id?: string }) => ({
            id: req.id,
            method: req.method,
            url: (req.url ?? '').split('?')[0],
          }),
          res: (res: ServerResponse) => ({ statusCode: res.statusCode }),
        },
        transport: isProduction()
          ? undefined
          : {
              target: 'pino-pretty',
              options: { singleLine: true, colorize: true },
            },
      },
    }),
  ],
})
export class LoggingModule {}
