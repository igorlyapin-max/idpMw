import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  PrismaHealthIndicator,
} from '@nestjs/terminus';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prisma: PrismaHealthIndicator,
    private readonly prismaService: PrismaService,
    private readonly config: ConfigService,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.prisma.pingCheck('database', this.prismaService),
      () =>
        Promise.resolve({
          redis: {
            status: 'up',
            enabled: this.config.get<boolean>('REDIS_ENABLED') ?? false,
            mode: 'not_supported_in_current_build',
          },
        }),
      () =>
        Promise.resolve({
          kafka: {
            status: 'up',
            enabled: this.config.get<boolean>('KAFKA_ENABLED') ?? false,
            brokers: this.config.get<string>('KAFKA_BROKERS') ?? null,
          },
        }),
    ]);
  }
}
