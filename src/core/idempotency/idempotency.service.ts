import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IdempotencyStore } from './idempotency.store.interface';
import { RedisIdempotencyStore } from './stores/redis-idempotency.store';
import { PgIdempotencyStore } from './stores/pg-idempotency.store';
import { EncryptionService } from '../../security/encryption.service';

@Injectable()
export class IdempotencyService {
  private readonly logger = new Logger(IdempotencyService.name);
  private readonly store: IdempotencyStore;

  constructor(
    private readonly config: ConfigService,
    private readonly redisStore: RedisIdempotencyStore,
    private readonly pgStore: PgIdempotencyStore,
    @Optional() private readonly encryption?: EncryptionService,
  ) {
    const redisEnabled = this.config.get<boolean>('REDIS_ENABLED') ?? false;
    this.store = redisEnabled ? this.redisStore : this.pgStore;
    this.logger.log(
      `Using idempotency store: ${redisEnabled ? 'Redis' : 'PostgreSQL'}`,
    );
  }

  async checkAndLock(key: string, ttlSeconds: number = 3600): Promise<boolean> {
    const keys = this.encryption?.idempotencyKeys(key) ?? [key];
    if (keys.length > 1) {
      for (const candidate of keys) {
        if (await this.store.exists(candidate)) {
          this.logger.warn('Duplicate event detected for encrypted key');
          return false;
        }
      }
    }

    const locked = await this.store.setIfNotExists(keys[0], ttlSeconds);
    if (!locked) {
      this.logger.warn(
        this.encryption?.isIdempotencyHmacEnabled()
          ? 'Duplicate event detected for encrypted key'
          : `Duplicate event detected: ${key}`,
      );
    }
    return locked;
  }

  async release(key: string): Promise<void> {
    const keys = this.encryption?.idempotencyKeys(key) ?? [key];
    await Promise.all(keys.map((candidate) => this.store.delete(candidate)));
  }
}
