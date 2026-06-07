import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { IdempotencyService } from './idempotency.service';
import { RedisIdempotencyStore } from './stores/redis-idempotency.store';
import { PgIdempotencyStore } from './stores/pg-idempotency.store';

describe('IdempotencyService', () => {
  let service: IdempotencyService;
  let pgStore: PgIdempotencyStore;
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
          useValue: { setIfNotExists: jest.fn(), delete: jest.fn() },
        },
        {
          provide: PgIdempotencyStore,
          useValue: { setIfNotExists: jest.fn(), delete: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<IdempotencyService>(IdempotencyService);
    pgStore = module.get<PgIdempotencyStore>(PgIdempotencyStore);
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

  it('should fail fast when Redis idempotency is enabled', async () => {
    await expect(
      Test.createTestingModule({
        providers: [
          IdempotencyService,
          {
            provide: ConfigService,
            useValue: { get: jest.fn().mockReturnValue(true) },
          },
          {
            provide: RedisIdempotencyStore,
            useValue: { setIfNotExists: jest.fn(), delete: jest.fn() },
          },
          {
            provide: PgIdempotencyStore,
            useValue: { setIfNotExists: jest.fn(), delete: jest.fn() },
          },
        ],
      }).compile(),
    ).rejects.toThrow('REDIS_ENABLED=true is not supported');
  });
});
