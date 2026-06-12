import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';

const originalAdminUiEnabled = process.env['ADMIN_UI_ENABLED'];
process.env['ADMIN_UI_ENABLED'] = 'true';

const { AppModule } = jest.requireActual<typeof import('./../src/app.module')>(
  './../src/app.module',
);

describe('AppController (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect({ status: 'ok' });
  });

  it('/ready (GET)', () => {
    return request(app.getHttpServer())
      .get('/ready')
      .expect(200)
      .expect(
        (res: {
          body: {
            status: string;
            info: {
              database: { status: string };
              redis: { status: string; enabled: boolean };
              kafka: { status: string; enabled: boolean };
            };
          };
        }) => {
          expect(res.body.status).toBe('ok');
          expect(res.body.info.database.status).toBe('up');
          expect(res.body.info.redis).toMatchObject({
            status: 'up',
            enabled: false,
          });
          expect(res.body.info.kafka).toMatchObject({
            status: 'up',
            enabled: false,
          });
        },
      );
  });

  it('serves Admin UI shell for direct SPA routes', async () => {
    const res = await request(app.getHttpServer())
      .get('/target-systems')
      .expect(200);

    expect(res.headers['content-type']).toContain('text/html');
    expect(res.text).toContain('<div id="root"></div>');
  });

  it('does not serve Admin UI shell for API routes', async () => {
    const res = await request(app.getHttpServer())
      .get('/admin/no-such-route')
      .expect(404);

    expect(res.headers['content-type']).toContain('application/json');
    expect(res.body).toMatchObject({
      message: 'Cannot GET /admin/no-such-route',
      statusCode: 404,
    });
  });

  afterEach(async () => {
    await app?.close();
  });

  afterAll(async () => {
    if (originalAdminUiEnabled === undefined) {
      delete process.env['ADMIN_UI_ENABLED'];
    } else {
      process.env['ADMIN_UI_ENABLED'] = originalAdminUiEnabled;
    }
  });
});
