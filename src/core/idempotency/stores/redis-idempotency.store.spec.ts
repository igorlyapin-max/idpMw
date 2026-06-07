import Redis from 'ioredis';
import { ConfigService } from '@nestjs/config';
import { RedisIdempotencyStore } from './redis-idempotency.store';

jest.mock('ioredis', () => ({
  __esModule: true,
  default: jest.fn(),
}));

const connectMock = jest.fn();
const pingMock = jest.fn();
const setMock = jest.fn();
const existsMock = jest.fn();
const delMock = jest.fn();
const quitMock = jest.fn();
const onMock = jest.fn();
const redisMock = Redis as unknown as jest.Mock;

function createConfig(values: Record<string, unknown>): ConfigService {
  return {
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService;
}

describe('RedisIdempotencyStore', () => {
  beforeEach(() => {
    redisMock.mockReset();
    connectMock.mockReset();
    pingMock.mockReset();
    setMock.mockReset();
    existsMock.mockReset();
    delMock.mockReset();
    quitMock.mockReset();
    onMock.mockReset();

    connectMock.mockResolvedValue(undefined);
    pingMock.mockResolvedValue('PONG');
    existsMock.mockResolvedValue(0);
    delMock.mockResolvedValue(1);
    quitMock.mockResolvedValue('OK');
    redisMock.mockImplementation(() => ({
      connect: connectMock,
      ping: pingMock,
      set: setMock,
      exists: existsMock,
      del: delMock,
      quit: quitMock,
      on: onMock,
    }));
  });

  it('does not create Redis client when disabled', async () => {
    const store = new RedisIdempotencyStore(
      createConfig({ REDIS_ENABLED: false }),
    );

    await store.onModuleInit();
    const health = await store.healthCheck();

    expect(redisMock).not.toHaveBeenCalled();
    expect(health.redis).toEqual(
      expect.objectContaining({ status: 'up', enabled: false }),
    );
  });

  it('connects and pings Redis when enabled', async () => {
    const store = new RedisIdempotencyStore(
      createConfig({
        REDIS_ENABLED: true,
        REDIS_HOST: '127.0.0.1',
        REDIS_PORT: 16379,
        REDIS_DB: 0,
      }),
    );

    await store.onModuleInit();

    expect(redisMock).toHaveBeenCalledWith(
      expect.objectContaining({
        host: '127.0.0.1',
        port: 16379,
        lazyConnect: true,
      }),
    );
    expect(connectMock).toHaveBeenCalled();
    expect(pingMock).toHaveBeenCalled();
  });

  it('uses SET NX EX for idempotency lock', async () => {
    setMock.mockResolvedValue('OK');
    const store = new RedisIdempotencyStore(
      createConfig({ REDIS_ENABLED: true }),
    );

    await expect(store.setIfNotExists('k1', 60)).resolves.toBe(true);

    expect(setMock).toHaveBeenCalledWith('k1', '1', 'EX', 60, 'NX');
  });

  it('returns false when Redis key already exists', async () => {
    setMock.mockResolvedValue(null);
    const store = new RedisIdempotencyStore(
      createConfig({ REDIS_ENABLED: true }),
    );

    await expect(store.setIfNotExists('k1', 60)).resolves.toBe(false);
  });

  it('deletes keys on release', async () => {
    const store = new RedisIdempotencyStore(
      createConfig({ REDIS_ENABLED: true }),
    );

    await store.delete('k1');

    expect(delMock).toHaveBeenCalledWith('k1');
  });

  it('checks Redis key existence for rotation-aware idempotency', async () => {
    existsMock.mockResolvedValue(1);
    const store = new RedisIdempotencyStore(
      createConfig({ REDIS_ENABLED: true }),
    );

    await expect(store.exists('k1')).resolves.toBe(true);

    expect(existsMock).toHaveBeenCalledWith('k1');
  });
});
