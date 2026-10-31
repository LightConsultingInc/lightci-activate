import 'dotenv/config';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { ProblemDetailsFilter } from './common/http-exception.filter';
import { requestIdMiddleware } from './common/request-id.middleware';
import { assertEnv, edition, isProduction, processRole } from './config/env';

async function bootstrap() {
  // Refuse to start with an incomplete or unsafe configuration. Every problem is
  // listed at once so an operator fixes them in one pass.
  assertEnv();

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
    bufferLogs: true,
  });
  const logger = app.get(Logger);
  app.useLogger(logger);
  app.use(requestIdMiddleware);
  app.enableShutdownHooks();
  app.enableCors({
    origin: (
      process.env.CORS_ORIGINS ??
      process.env.WEB_URL ??
      'http://localhost:3000'
    ).split(','),
    credentials: true,
    exposedHeaders: ['mcp-session-id', 'Mcp-Session-Id', 'X-Request-Id'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Activate-Org',
      'X-Request-Id',
      'mcp-session-id',
      'Mcp-Session-Id',
      'MCP-Protocol-Version',
      'Accept',
      'Last-Event-ID',
    ],
  });
  app.setGlobalPrefix('api', {
    exclude: ['mcp', 'mcp/(.*)', '.well-known/(.*)'],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );
  app.useGlobalFilters(new ProblemDetailsFilter());

  if (!isProduction()) {
    const config = new DocumentBuilder()
      .setTitle('LightCI Activate API')
      .setDescription(
        'Activation and enablement platform for Claude Enterprise customers.',
      )
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config));
  }

  const port = process.env.PORT ?? 4000;
  await app.listen(port);
  logger.log(
    `Activate API listening on ${port} (edition=${edition()}, role=${processRole()}${
      isProduction() ? '' : ', Swagger at /docs'
    })`,
    'Bootstrap',
  );
}
void bootstrap();
