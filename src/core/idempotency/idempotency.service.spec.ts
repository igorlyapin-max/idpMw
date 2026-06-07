import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { IdempotencyService } from './idempotency.service';
import { RedisIdempotencyStore } from './stores/redis-idempotency.store';
import { PgIdempotencyStore } from './stores/pg-idempotency.store';
import { EncryptionService } from '../../security/encryption.service';

describe('IdempotencyService', () => {
  let service: IdempotencyService;
  let pgStore: PgIdempotencyStore;
  let redisStore: RedisIdempotencyStore;
  let config: { get: jest.Mock };

  beforeEach(async () => {
    config = { get: jest.fn().mockReturnValue(false) };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IdempotencyService,
        {
          provide: ConfigService,
          useValue: config,
        },
        {
          provide: RedisIdempotencyStore,
          useValue: {
            exists: jest.fn(),
            setIfNotExists: jest.fn(),
            delete: jest.fn(),
          },
        },
        {
          provide: PgIdempotencyStore,
          useValue: {
            exists: jest.fn(),
            setIfNotExists: jest.fn(),
            delete: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<IdempotencyService>(IdempotencyService);
    pgStore = module.get<PgIdempotencyStore>(PgIdempotencyStore);
    redisStore = module.get<RedisIdempotencyStore>(RedisIdempotencyStore);
  });

  it('should allow new key', async () => {
    jest.spyOn(pgStore, 'setIfNotExists').mockResolvedValue(true);
    const result = await service.checkAndLock('key-1');
    expect(result).toBe(true);
  });

  it('should reject duplicate key', async () => {
    jest.spyOn(pgStore, 'setIfNotExists').mockResolvedValue(false);
    const result = await service.checkAndLock('key-1');
    expect(result).toBe(false);
  });

  it('should use Redis store when Redis idempotency is enabled', async () => {
    const redis = {
      exists: jest.fn(),
      setIfNotExists: jest.fn(),
      delete: jest.fn(),
    };
    const module = await Test.createTestingModule({
      providers: [
        IdempotencyService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => key === 'REDIS_ENABLED'),
          },
        },
        {
          provide: RedisIdempotencyStore,
          useValue: redis,
        },
        {
          provide: PgIdempotencyStore,
          useValue: {
            exists: jest.fn(),
            setIfNotExists: jest.fn(),
            delete: jest.fn(),
          },
        },
      ],
    }).compile();
    const redisService = module.get<IdempotencyService>(IdempotencyService);
    redis.setIfNotExists.mockResolvedValue(true);

    await expect(redisService.checkAndLock('key-redis')).resolves.toBe(true);
    expect(redis.setIfNotExists).toHaveBeenCalledWith('key-redis', 3600);
  });

  it('should release through the selected store', async () => {
    const deleteSpy = jest
      .spyOn(redisStore, 'delete')
      .mockResolvedValue(undefined);
    config.get.mockImplementation((key: string) => key === 'REDIS_ENABLED');
    const serviceWithRedis = new IdempotencyService(
      config as unknown as ConfigService,
      redisStore,
      pgStore,
    );

    await serviceWithRedis.release('key-release');

    expect(deleteSpy).toHaveBeenCalledWith('key-release');
  });

  it('uses deterministic HMAC keys when encryption is enabled', async () => {
    const oldEnv = process.env;
    process.env = {
      ...oldEnv,
      ENCRYPTION_ENABLED: 'true',
      ENCRYPTION_ACTIVE_KEY_ID: 'key_a',
      ENCRYPTION_KEYS: 'key_a',
      ENCRYPTION_KEY_KEY_A: Buffer.alloc(32, 1).toString('base64'),
    };
    const hmacPgStore = {
      exists: jest.fn().mockResolvedValue(false),
      setIfNotExists: jest.fn().mockResolvedValue(true),
      delete: jest.fn(),
    };
    const hmacService = new IdempotencyService(
      config as unknown as ConfigService,
      redisStore,
      hmacPgStore as unknown as PgIdempotencyStore,
      new EncryptionService(),
    );

    await expect(hmacService.checkAndLock('event-plain')).resolves.toBe(true);

    expect(hmacPgStore.setIfNotExists).toHaveBeenCalledWith(
      expect.stringMatching(/^idmmw:hmac:key_a:/),
      3600,
    );
    process.env = oldEnv;
  });
});
