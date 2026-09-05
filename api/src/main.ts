import 'dotenv/config';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { ProblemDetailsFilter } from './common/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });
  app.enableCors({
    origin: (
      process.env.CORS_ORIGINS ??
      process.env.WEB_URL ??
      'http://localhost:3000'
    ).split(','),
    credentials: true,
    exposedHeaders: ['mcp-session-id', 'Mcp-Session-Id'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Activate-Org',
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

  if (process.env.NODE_ENV !== 'production') {
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
  console.log(`Activate API on http://localhost:${port} (Swagger at /docs)`);
}
void bootstrap();
