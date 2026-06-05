import { Test, TestingModule } from '@nestjs/testing';
import { HttpModule } from '@nestjs/axios';
import { RestConnectorService } from './rest-connector.service';

describe('RestConnectorService', () => {
  let service: RestConnectorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [HttpModule],
      providers: [RestConnectorService],
    }).compile();

    service = module.get<RestConnectorService>(RestConnectorService);
  });

  it('should return error for missing URL', async () => {
    const result = await service.execute({
      operation: 'create',
      targetSystem: 'rest',
      payload: {},
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Missing target URL');
  });
});
