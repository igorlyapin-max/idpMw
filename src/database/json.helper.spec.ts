import { ConfigService } from '@nestjs/config';
import { JsonHelper } from './json.helper';
import { EncryptionService } from '../security/encryption.service';

function config(provider: 'postgresql' | 'sqlite'): ConfigService {
  return {
    get: jest.fn((key: string) =>
      key === 'DATABASE_PROVIDER' ? provider : undefined,
    ),
  } as unknown as ConfigService;
}

describe('JsonHelper', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      ENCRYPTION_ENABLED: 'true',
      ENCRYPTION_ACTIVE_KEY_ID: 'key_a',
      ENCRYPTION_KEYS: 'key_a',
      ENCRYPTION_KEY_KEY_A: Buffer.alloc(32, 1).toString('base64'),
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('encrypts and decrypts PostgreSQL JSON values', () => {
    const helper = new JsonHelper(
      config('postgresql'),
      new EncryptionService(),
    );
    const stored = helper.toJson({ token: 'secret' });

    expect(stored).toEqual(expect.objectContaining({ __enc: 'idmmw.v1' }));
    expect(helper.fromJson(stored)).toEqual({ token: 'secret' });
  });

  it('encrypts and decrypts SQLite string JSON values', () => {
    const helper = new JsonHelper(config('sqlite'), new EncryptionService());
    const stored = helper.toJson({ token: 'secret' });

    expect(typeof stored).toBe('string');
    expect(stored as string).toContain('idmmw.v1');
    expect(helper.fromJson(stored)).toEqual({ token: 'secret' });
  });
});
