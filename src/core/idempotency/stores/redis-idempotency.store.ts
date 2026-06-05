import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IdempotencyStore } from '../idempotency.store.interface';

@Injectable()
export class RedisIdempotencyStore implements IdempotencyStore {
  private readonly logger = new Logger(RedisIdempotencyStore.name);

  constructor(private readonly config: ConfigService) {}

  // eslint-disable-next-line @typescript-eslint/require-await, @typescript-eslint/no-unused-vars
  async setIfNotExists(_key: string, _ttlSeconds: number): Promise<boolean> {
    this.logger.warn('Redis not implemented yet, falling through to false');
    return false;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async delete(_key: string): Promise<void> {
    // no-op
  }
}
