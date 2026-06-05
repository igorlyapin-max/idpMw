import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { IdempotencyService } from './idempotency.service';
import { RedisIdempotencyStore } from './stores/redis-idempotency.store';
import { PgIdempotencyStore } from './stores/pg-idempotency.store';

describe('IdempotencyService', () => {
  let service: IdempotencyService;
  let pgStore: PgIdempotencyStore;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IdempotencyService,
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue(false) },
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
});
