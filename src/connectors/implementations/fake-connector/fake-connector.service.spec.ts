import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import { FakeConnectorService } from './fake-connector.service';

describe('FakeConnectorService', () => {
  let service: FakeConnectorService;
  let httpService: { post: jest.Mock; get: jest.Mock };

  beforeEach(async () => {
    httpService = { post: jest.fn(), get: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FakeConnectorService,
        { provide: HttpService, useValue: httpService },
      ],
    }).compile();

    service = module.get<FakeConnectorService>(FakeConnectorService);
  });

  describe('execute', () => {
    it('should run local mock mode when baseUrl is missing', async () => {
      const result = await service.execute({
        operation: 'user.create',
        targetSystem: 'fake',
        payload: {},
      });
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ status: 'created' });
    });

    it('should run local mock mode for read operations', async () => {
      const result = await service.execute({
        operation: 'user.search',
        targetSystem: 'fake',
        payload: {},
      });
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ total: 2 });
    });

    it('should post to echo endpoint when baseUrl is configured', async () => {
      httpService.post.mockReturnValue(
        of({ status: 200, data: { mirrored: true } }),
      );
      const result = await service.execute({
        operation: 'user.create',
        targetSystem: 'fake',
        payload: {
          config: { baseUrl: 'http://fake', apiKey: 'k123' },
          data: { name: 'Test' },
        },
      });
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ mirrored: true });
      expect(httpService.post).toHaveBeenCalledWith(
        'http://fake/api/echo',
        expect.objectContaining({ operation: 'user.create' }),
        expect.objectContaining({
          headers: { 'Content-Type': 'application/json', 'X-Api-Id': 'k123' },
        }),
      );
    });

    it('should return error on http failure', async () => {
      httpService.post.mockReturnValue(throwError(() => new Error('Timeout')));
      const result = await service.execute({
        operation: 'user.create',
        targetSystem: 'fake',
        payload: { config: { baseUrl: 'http://fake' } },
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Timeout');
    });
  });

  describe('testConnection', () => {
    it('should return success for local mock mode', async () => {
      const result = await service.testConnection({});
      expect(result.success).toBe(true);
      expect(result.message).toContain('local');
    });

    it('should return success when health is reachable', async () => {
      httpService.get.mockReturnValue(of({ status: 200 }));
      const result = await service.testConnection({
        baseUrl: 'http://fake',
        apiKey: 'k',
      });
      expect(result.success).toBe(true);
      expect(result.message).toContain('reachable');
    });

    it('should return error on failure', async () => {
      httpService.get.mockReturnValue(
        throwError(() => new Error('Connection refused')),
      );
      const result = await service.testConnection({
        baseUrl: 'http://fake',
      });
      expect(result.success).toBe(false);
      expect(result.message).toContain('Connection refused');
    });
  });
});
