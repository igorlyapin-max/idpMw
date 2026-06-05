import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SecretResolverService } from './secret-resolver.service';
import { IndeedPamAapmClient } from './indeed-pam-aapm.client';

describe('SecretResolverService', () => {
  let service: SecretResolverService;
  let pamClient: jest.Mocked<IndeedPamAapmClient>;
  let configGet: jest.Mock;

  beforeEach(async () => {
    pamClient = {
      getValue: jest.fn(),
    } as unknown as jest.Mocked<IndeedPamAapmClient>;

    configGet = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SecretResolverService,
        { provide: IndeedPamAapmClient, useValue: pamClient },
        {
          provide: ConfigService,
          useValue: { get: configGet },
        },
      ],
    }).compile();

    service = module.get<SecretResolverService>(SecretResolverService);
  });

  afterEach(() => {
    delete process.env['TEST_VAR'];
    delete process.env['VAR1'];
    delete process.env['VAR2'];
    delete process.env['SECRETS_PROVIDER'];
  });

  it('should skip resolution when provider is None', async () => {
    configGet.mockReturnValue('None');
    await expect(service.resolveAll()).resolves.toBeUndefined();
  });

  it('should resolve PAM reference and update env', async () => {
    configGet.mockReturnValue('IndeedPamAapm');
    process.env['TEST_VAR'] = 'secret://Test.Account';
    pamClient.getValue.mockResolvedValue('resolved-value');

    await service.resolveAll();

    expect(pamClient.getValue).toHaveBeenCalledWith('Test.Account');
    expect(process.env['TEST_VAR']).toBe('resolved-value');
  });

  it('should cache resolved values', async () => {
    configGet.mockReturnValue('IndeedPamAapm');
    process.env['VAR1'] = 'secret://Test.Account';
    process.env['VAR2'] = 'secret://Test.Account';
    pamClient.getValue.mockResolvedValue('cached-value');

    await service.resolveAll();

    expect(pamClient.getValue).toHaveBeenCalledTimes(1);
    expect(process.env['VAR1']).toBe('cached-value');
    expect(process.env['VAR2']).toBe('cached-value');
  });

  it('should throw on unsupported provider', async () => {
    configGet.mockReturnValue('Unsupported');
    process.env['TEST_VAR'] = 'secret://Test.Account';
    await expect(service.resolveAll()).rejects.toThrow(
      "Configuration contains PAM references, but Secrets.Provider is 'Unsupported'.",
    );
  });
});
