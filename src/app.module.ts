import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { LoggerModule } from 'nestjs-pino';
import { appConfigSchema } from './config/app.config';
import { PrismaModule } from './database/prisma.module';
import { SecretsModule } from './secrets/secrets.module';
import { HealthModule } from './health/health.module';
import { MockIdpModule } from './mock-idp/mock-idp.module';
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
      pinoHttp: {
        level: process.env['NODE_ENV'] === 'production' ? 'info' : 'debug',
        transport:
          process.env['NODE_ENV'] !== 'production'
            ? { target: 'pino-pretty' }
            : undefined,
      },
    }),
    SecretsModule,
    PrismaModule,
    HealthModule,
    MockIdpModule,
    WebhooksModule,
    ...(isLightweight ? [] : [KafkaModule]),
    AdminModule,
    MetricsModule,
    ServeStaticModule.forRootAsync({
      useFactory: (config: ConfigService) => {
        const enabled = config.get<boolean>('ADMIN_UI_ENABLED') ?? false;
        return [
          enabled
            ? {
                rootPath: join(__dirname, '..', 'ui', 'dist'),
                serveRoot: '/',
                serveStaticOptions: {
                  index: 'index.html',
                },
              }
            : { rootPath: '/dev/null' },
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
