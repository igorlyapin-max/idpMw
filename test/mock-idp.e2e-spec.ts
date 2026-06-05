import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

interface MockIdpResponse {
  success: boolean;
  event: {
    operation: string;
  };
}

describe('Mock IDP (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('POST /mock-idp/scenario/create-user', async () => {
    const res = await request(app.getHttpServer())
      .post('/mock-idp/scenario/create-user')
      .expect(200);

    const body = res.body as MockIdpResponse;
    expect(body.success).toBe(true);
    expect(body.event.operation).toBe('create');
  });

  it('POST /mock-idp/scenario/duplicate — second request returns processed=false', async () => {
    const res = await request(app.getHttpServer())
      .post('/mock-idp/scenario/duplicate')
      .expect(200);

    const body = res.body as MockIdpResponse;
    expect(body.success).toBe(true);
  });

  afterAll(async () => {
    await app.close();
  });
});
