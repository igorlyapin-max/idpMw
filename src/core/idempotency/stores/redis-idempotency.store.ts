import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { IdempotencyStore } from '../idempotency.store.interface';
import { TlsOptionsFactory } from '../../../security/tls-options.factory';

@Injectable()
export class RedisIdempotencyStore
  implements IdempotencyStore, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(RedisIdempotencyStore.name);
  private readonly enabled: boolean;
  private readonly host: string;
  private readonly port: number;
  private readonly db: number;
  private readonly client: Redis | undefined;

  constructor(
    private readonly config: ConfigService,
    @Optional() private readonly tlsOptions?: TlsOptionsFactory,
  ) {
    this.enabled = this.config.get<boolean>('REDIS_ENABLED') ?? false;
    this.host = this.config.get<string>('REDIS_HOST') ?? 'localhost';
    this.port = this.config.get<number>('REDIS_PORT') ?? 6379;
    this.db = this.config.get<number>('REDIS_DB') ?? 0;

    if (this.enabled) {
      this.client = new Redis({
        host: this.host,
        port: this.port,
        db: this.db,
        password: this.config.get<string>('REDIS_PASSWORD'),
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        ...(this.tlsOptions?.redisOptions() ?? {}),
      });
      this.client.on('error', (error: Error) => {
        this.logger.error(`Redis client error: ${error.message}`);
      });
    }
  }

  async onModuleInit(): Promise<void> {
    if (!this.client) {
      return;
    }
    await this.client.connect();
    await this.client.ping();
    this.logger.log(
      `Redis idempotency store connected to ${this.host}:${this.port}`,
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.client?.quit();
  }

  async setIfNotExists(key: string, ttlSeconds: number): Promise<boolean> {
    const client = this.requireClient();
    const result = await client.set(key, '1', 'EX', ttlSeconds, 'NX');
    return result === 'OK';
  }

  async exists(key: string): Promise<boolean> {
    const client = this.requireClient();
    return (await client.exists(key)) === 1;
  }

  async delete(key: string): Promise<void> {
    const client = this.requireClient();
    await client.del(key);
  }

  async healthCheck(): Promise<{
    redis: {
      status: 'up' | 'down';
      enabled: boolean;
      host: string;
      port: number;
      mode: string;
      error?: string;
    };
  }> {
    if (!this.enabled) {
      return {
        redis: {
          status: 'up',
          enabled: false,
          host: this.host,
          port: this.port,
          mode: 'disabled',
        },
      };
    }

    try {
      await this.requireClient().ping();
      return {
        redis: {
          status: 'up',
          enabled: true,
          host: this.host,
          port: this.port,
          mode: 'redis_set_nx_ex',
        },
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        redis: {
          status: 'down',
          enabled: true,
          host: this.host,
          port: this.port,
          mode: 'redis_set_nx_ex',
          error: msg,
        },
      };
    }
  }

  private requireClient(): Redis {
    if (!this.client) {
      throw new Error('Redis idempotency store is disabled');
    }
    return this.client;
  }
}
