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

  process.on('SIGINT', () => {
    console.log(`Shutting down. Admin UI was available at: ${uiUrl}`);
  });
  process.on('SIGTERM', () => {
    console.log(`Shutting down. Admin UI was available at: ${uiUrl}`);
  });
}

void bootstrap();
