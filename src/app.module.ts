import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { LoggerModule } from 'nestjs-pino';
import { appConfigSchema } from './config/app.config';
import { createPinoHttpConfig } from './config/logging.config';
import { PrismaModule } from './database/prisma.module';
import { SecretsModule } from './secrets/secrets.module';
import { DiagnosticsModule } from './diagnostics/diagnostics.module';
import { HealthModule } from './health/health.module';
import { MockIdmModule } from './mock-idm/mock-idm.module';
import { WebhooksModule } from './inbound/webhooks/webhooks.module';
import { KafkaModule } from './kafka/kafka.module';
import { AdminModule } from './admin/admin.module';
import { MetricsModule } from './metrics/metrics.module';
import { HttpMetricsMiddleware } from './metrics/http-metrics.middleware';
import { applyPamCompatibility } from './secrets/legacy-compat';

applyPamCompatibility();

const isLightweight = process.env['LIGHTWEIGHT_MODE'] === 'true';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: (config: Record<string, unknown>) => {
        const parsed = appConfigSchema.safeParse(config);
        if (!parsed.success) {
          throw new Error(`Config validation error: ${parsed.error.message}`);
        }
        return parsed.data;
      },
    }),
    LoggerModule.forRoot({
      pinoHttp: createPinoHttpConfig(),
    }),
    DiagnosticsModule,
    SecretsModule,
    PrismaModule,
    HealthModule,
    MockIdmModule,
    WebhooksModule,
    ...(isLightweight ? [] : [KafkaModule]),
    AdminModule,
    MetricsModule,
    ServeStaticModule.forRootAsync({
      useFactory: (config: ConfigService) => {
        const adminUiEnabled = config.get<boolean>('ADMIN_UI_ENABLED') ?? false;
        const emulatorPath = join(__dirname, '..', 'idm-emulator', 'dist');
        return [
          {
            rootPath: emulatorPath,
            serveRoot: '/idm-emulator',
            serveStaticOptions: {
              index: 'index.html',
            },
          },
          ...(adminUiEnabled
            ? [
                {
                  rootPath: join(__dirname, '..', 'ui', 'dist'),
                  serveRoot: '/',
                  serveStaticOptions: {
                    index: 'index.html',
                  },
                },
              ]
            : []),
        ];
      },
      inject: [ConfigService],
    }),
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(HttpMetricsMiddleware).forRoutes('*');
  }
}
