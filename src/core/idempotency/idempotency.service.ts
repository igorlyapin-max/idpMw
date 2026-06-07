import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IdempotencyStore } from './idempotency.store.interface';
import { RedisIdempotencyStore } from './stores/redis-idempotency.store';
import { PgIdempotencyStore } from './stores/pg-idempotency.store';

@Injectable()
export class IdempotencyService {
  private readonly logger = new Logger(IdempotencyService.name);
  private readonly store: IdempotencyStore;

  constructor(
    private readonly config: ConfigService,
    private readonly redisStore: RedisIdempotencyStore,
    private readonly pgStore: PgIdempotencyStore,
  ) {
    const redisEnabled = this.config.get<boolean>('REDIS_ENABLED') ?? false;
    if (redisEnabled) {
      throw new Error(
        'REDIS_ENABLED=true is not supported in this build: Redis idempotency store is not implemented. Set REDIS_ENABLED=false to use PostgreSQL idempotency.',
      );
    }
    this.store = redisEnabled ? this.redisStore : this.pgStore;
    this.logger.log(
      `Using idempotency store: ${redisEnabled ? 'Redis' : 'PostgreSQL'}`,
    );
  }

  async checkAndLock(key: string, ttlSeconds: number = 3600): Promise<boolean> {
    const locked = await this.store.setIfNotExists(key, ttlSeconds);
    if (!locked) {
      this.logger.warn(`Duplicate event detected: ${key}`);
    }
    return locked;
  }

  async release(key: string): Promise<void> {
    await this.store.delete(key);
  }
}
