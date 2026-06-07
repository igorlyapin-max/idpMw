import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { DiagnosticLoggerService } from './diagnostics/diagnostic-logger.service';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT') ?? 3010;

  const swaggerConfig = new DocumentBuilder()
    .setTitle('idmMw API')
    .setDescription('Middleware for Avanpost IDM integration')
    .setVersion('0.0.1')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api', app, document);

  app.enableShutdownHooks();

  await app.listen(port);
  const adminUiEnabled =
    configService.get<boolean>('ADMIN_UI_ENABLED') ?? false;
  const uiUrl = adminUiEnabled ? `http://localhost:${port}/` : 'disabled';
  const logger = app.get(Logger);
  const diagnostics = app.get(DiagnosticLoggerService);
  const startupInfo = {
    app: `http://localhost:${port}`,
    swagger: `http://localhost:${port}/api`,
    metrics: `http://localhost:${port}/metrics`,
    adminUi: uiUrl,
    grafana: 'http://localhost:3000',
    debugLoggingEnabled: diagnostics.isEnabled(),
    debugLoggingLevel: diagnostics.level(),
    logSink: configService.get<string>('LOG_SINK') ?? 'stdout',
  };
  logger.log({ event: 'startup.complete', ...startupInfo });
  diagnostics.basic('startup.runtime', startupInfo);

  const shutdownMsg = [
    'Shutting down. Services were available at:',
    `  App:       http://localhost:${port}`,
    `  Swagger:   http://localhost:${port}/api`,
    `  Metrics:   http://localhost:${port}/metrics`,
    `  Admin UI:  ${uiUrl}`,
    `  Grafana:   http://localhost:3000 (login: admin / code: admin)`,
  ].join('\n');

  process.on('SIGINT', () => {
    logger.log({ event: 'shutdown.signal', signal: 'SIGINT', shutdownMsg });
  });
  process.on('SIGTERM', () => {
    logger.log({ event: 'shutdown.signal', signal: 'SIGTERM', shutdownMsg });
  });
}

void bootstrap();
