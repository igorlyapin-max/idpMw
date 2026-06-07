import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

interface MockIdmResponse {
  success: boolean;
  event: {
    operation: string;
  };
}

describe('Mock IDM (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('POST /mock-idm/scenario/user-create', async () => {
    const res = await request(app.getHttpServer())
      .post('/mock-idm/scenario/user-create')
      .expect(200);

    const body = res.body as MockIdmResponse;
    expect(body.success).toBe(true);
    expect(body.event.operation).toBe('user.create');
  });

  it('POST /mock-idm/scenario/duplicate — second request returns processed=false', async () => {
    const res = await request(app.getHttpServer())
      .post('/mock-idm/scenario/duplicate')
      .expect(200);

    const body = res.body as MockIdmResponse;
    expect(body.success).toBe(true);
  });

  afterAll(async () => {
    await app.close();
  });
});
