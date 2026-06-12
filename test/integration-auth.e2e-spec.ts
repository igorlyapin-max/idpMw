import { createHash, createHmac } from 'crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';

const originalIntegrationAuthEnabled = process.env['INTEGRATION_AUTH_ENABLED'];
const originalIntegrationAuthSecret = process.env['INTEGRATION_AUTH_SECRET'];
process.env['INTEGRATION_AUTH_ENABLED'] = 'true';
process.env['INTEGRATION_AUTH_SECRET'] = 'integration-test-secret';

const { AppModule } =
  jest.requireActual<typeof import('../src/app.module')>('../src/app.module');

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
    .join(',')}}`;
}

function sign(params: {
  timestamp: string;
  method: string;
  path: string;
  body: unknown;
}): string {
  const bodyHash = createHash('sha256')
    .update(stableStringify(params.body))
    .digest('hex');
  return createHmac('sha256', 'integration-test-secret')
    .update([params.timestamp, params.method, params.path, bodyHash].join('\n'))
    .digest('hex');
}

describe('Integration auth (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    if (originalIntegrationAuthEnabled === undefined) {
      delete process.env['INTEGRATION_AUTH_ENABLED'];
    } else {
      process.env['INTEGRATION_AUTH_ENABLED'] = originalIntegrationAuthEnabled;
    }
    if (originalIntegrationAuthSecret === undefined) {
      delete process.env['INTEGRATION_AUTH_SECRET'];
    } else {
      process.env['INTEGRATION_AUTH_SECRET'] = originalIntegrationAuthSecret;
    }
  });

  it('rejects unsigned webhook requests', async () => {
    await request(app.getHttpServer())
      .post('/webhooks/avanpost')
      .send({
        eventId: 'unsigned',
        operation: 'user.create',
        targetSystem: 'fake',
        payload: { data: { username: 'unsigned' } },
      })
      .expect(401);
  });

  it('accepts signed webhook requests', async () => {
    const body = {
      eventId: `signed-${Date.now()}`,
      operation: 'user.create',
      targetSystem: 'fake',
      payload: { data: { username: 'signed' } },
    };
    const timestamp = String(Math.floor(Date.now() / 1000));

    await request(app.getHttpServer())
      .post('/webhooks/avanpost')
      .set('X-IDMMW-Timestamp', timestamp)
      .set(
        'X-IDMMW-Signature',
        sign({
          timestamp,
          method: 'POST',
          path: '/webhooks/avanpost',
          body,
        }),
      )
      .send(body)
      .expect(201);
  });
});
