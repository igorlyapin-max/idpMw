import { Module } from '@nestjs/common';
import { ConnectorsModule } from '../connectors/connectors.module';
import { MetricsModule } from '../metrics/metrics.module';
import { IdempotencyService } from './idempotency/idempotency.service';
import { RedisIdempotencyStore } from './idempotency/stores/redis-idempotency.store';
import { PgIdempotencyStore } from './idempotency/stores/pg-idempotency.store';
import { RetryService } from './retry/retry.service';
import { DlqService } from './dlq/dlq.service';
import { AuditInterceptor } from './audit/audit.interceptor';
import { ProcessingService } from './processing.service';

@Module({
  imports: [ConnectorsModule, MetricsModule],
  providers: [
    IdempotencyService,
    RedisIdempotencyStore,
    PgIdempotencyStore,
    RetryService,
    DlqService,
    AuditInterceptor,
    ProcessingService,
  ],
  exports: [
    IdempotencyService,
    RetryService,
    DlqService,
    AuditInterceptor,
    ProcessingService,
  ],
})
export class CoreModule {}
