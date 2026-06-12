import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('TargetSystem (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('POST /admin/target-systems → create and list', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/admin/target-systems')
      .send({
        name: 'test-zabbix-' + Date.now(),
        type: 'zabbix',
        label: 'Test Zabbix',
        config: { baseUrl: 'http://127.0.0.1:1', username: 'u', key: 'k' },
        enabled: true,
      });
    if (createRes.status !== 201) {
      console.log('CREATE RESPONSE:', createRes.status, createRes.body);
    }
    expect(createRes.status).toBe(201);
    expect(JSON.stringify(createRes.body)).not.toContain('"key":"k"');
    expect(createRes.body).toMatchObject({
      config: { key: '***' },
    });

    const id = (createRes.body as { id: string }).id;
    expect(id).toBeDefined();

    const listRes = await request(app.getHttpServer())
      .get('/admin/target-systems')
      .expect(200);

    const items = listRes.body as Array<{ id: string; name: string }>;
    expect(items.some((i) => i.id === id)).toBe(true);
    expect(JSON.stringify(listRes.body)).not.toContain('"key":"k"');

    await request(app.getHttpServer())
      .patch(`/admin/target-systems/${id}`)
      .send({ label: 'Updated', config: { key: '***', username: 'u2' } })
      .expect(200);

    await request(app.getHttpServer())
      .post(`/admin/target-systems/${id}/test`)
      .expect(200);

    await request(app.getHttpServer())
      .delete(`/admin/target-systems/${id}`)
      .expect(200);
  });

  afterAll(async () => {
    await app.close();
  });
});
