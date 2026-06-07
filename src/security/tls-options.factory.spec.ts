import { ConfigService } from '@nestjs/config';
import { TlsOptionsFactory } from './tls-options.factory';

function config(values: Record<string, unknown>): ConfigService {
  return {
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService;
}

describe('TlsOptionsFactory', () => {
  it('rejects HTTP URLs when target TLS is enabled', () => {
    const factory = new TlsOptionsFactory(config({}));

    expect(() =>
      factory.axiosConfig(
        'http://target.local',
        { enabled: true },
        'test target',
      ),
    ).toThrow(/https/);
  });

  it('creates HTTPS axios agent when target TLS is enabled', () => {
    const factory = new TlsOptionsFactory(config({}));
    const axiosConfig = factory.axiosConfig(
      'https://target.local',
      {
        enabled: true,
        ca: '-----BEGIN CERTIFICATE-----\\nX\\n-----END CERTIFICATE-----',
      },
      'test target',
    );

    expect(axiosConfig.httpsAgent).toBeDefined();
  });

  it('maps Kafka TLS env into Kafka ssl config', () => {
    const factory = new TlsOptionsFactory(
      config({
        KAFKA_TLS_ENABLED: true,
        KAFKA_TLS_CA: 'ca',
        KAFKA_TLS_REJECT_UNAUTHORIZED: 'false',
      }),
    );

    const kafkaConfig = factory.kafkaConfig('client', ['broker:9092']);

    expect(kafkaConfig.ssl).toEqual(
      expect.objectContaining({
        ca: 'ca',
        rejectUnauthorized: false,
      }),
    );
  });
});
