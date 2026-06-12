import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  PrismaHealthIndicator,
} from '@nestjs/terminus';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import { RedisIdempotencyStore } from '../core/idempotency/stores/redis-idempotency.store';

@Controller()
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prisma: PrismaHealthIndicator,
    private readonly prismaService: PrismaService,
    private readonly config: ConfigService,
    private readonly redisStore: RedisIdempotencyStore,
  ) {}

  @Get('health')
  check() {
    return { status: 'ok' };
  }

  @Get('ready')
  @HealthCheck()
  ready() {
    return this.health.check([
      () => this.prisma.pingCheck('database', this.prismaService),
      () => this.redisStore.healthCheck(),
      () =>
        Promise.resolve({
          kafka: {
            status: 'up',
            enabled: this.config.get<boolean>('KAFKA_ENABLED') ?? false,
            brokers: this.config.get<string>('KAFKA_BROKERS') ?? null,
            processingMode:
              this.config.get<string>('IDMMW_PROCESSING_MODE') ?? 'sync',
            topics: {
              eventsIn: this.config.get<string>('KAFKA_TOPIC_EVENTS_IN'),
              eventsOut: this.config.get<string>('KAFKA_TOPIC_EVENTS_OUT'),
              dlqRetry: this.config.get<string>('KAFKA_TOPIC_DLQ_RETRY'),
            },
          },
        }),
    ]);
  }
}
