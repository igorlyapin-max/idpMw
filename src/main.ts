import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT') ?? 3010;

  const swaggerConfig = new DocumentBuilder()
    .setTitle('idpMw API')
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
  console.log(`Application is running on: http://localhost:${port}`);
  console.log(`Swagger UI: http://localhost:${port}/api`);
  console.log(`Prometheus metrics: http://localhost:${port}/metrics`);
  console.log(`Admin UI: ${uiUrl}`);
  console.log(`Grafana: http://localhost:3000 (login: admin / code: admin)`);

  const shutdownMsg = [
    'Shutting down. Services were available at:',
    `  App:       http://localhost:${port}`,
    `  Swagger:   http://localhost:${port}/api`,
    `  Metrics:   http://localhost:${port}/metrics`,
    `  Admin UI:  ${uiUrl}`,
    `  Grafana:   http://localhost:3000 (login: admin / code: admin)`,
  ].join('\n');

  process.on('SIGINT', () => {
    console.log(shutdownMsg);
  });
  process.on('SIGTERM', () => {
    console.log(shutdownMsg);
  });
}

void bootstrap();
