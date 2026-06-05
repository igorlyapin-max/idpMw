import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import { CmdbuildConnectorService } from './cmdbuild-connector.service';

describe('CmdbuildConnectorService', () => {
  let service: CmdbuildConnectorService;
  let httpService: { post: jest.Mock; request: jest.Mock };

  beforeEach(async () => {
    httpService = { post: jest.fn(), request: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CmdbuildConnectorService,
        { provide: HttpService, useValue: httpService },
      ],
    }).compile();

    service = module.get<CmdbuildConnectorService>(CmdbuildConnectorService);
  });

  describe('execute', () => {
    it('should return error when baseUrl is missing', async () => {
      const result = await service.execute({
        operation: 'user.create',
        targetSystem: 'cmdbuild',
        payload: {},
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('baseUrl');
    });

    it('should perform user.create', async () => {
      httpService.post.mockReturnValue(
        of({ data: { data: { _id: 'sess1' } } }),
      );
      httpService.request.mockReturnValue(of({ data: { id: 'card1' } }));
      const result = await service.execute({
        operation: 'user.create',
        targetSystem: 'cmdbuild',
        payload: {
          config: { baseUrl: 'http://c', username: 'u', key: 'k' },
          params: { name: 'John' },
        },
      });
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ id: 'card1' });
    });
  });

  describe('testConnection', () => {
    it('should return error when baseUrl is missing', async () => {
      const result = await service.testConnection({});
      expect(result.success).toBe(false);
      expect(result.message).toContain('baseUrl');
    });

    it('should return success when api is reachable', async () => {
      httpService.post.mockReturnValue(
        of({ data: { data: { _id: 'sess1' } } }),
      );
      const result = await service.testConnection({
        baseUrl: 'http://c',
        username: 'u',
        key: 'k',
      });
      expect(result.success).toBe(true);
      expect(result.message).toContain('reachable');
    });

    it('should return error on failure', async () => {
      httpService.post.mockReturnValue(throwError(() => new Error('Timeout')));
      const result = await service.testConnection({
        baseUrl: 'http://c',
        username: 'u',
        key: 'k',
      });
      expect(result.success).toBe(false);
      expect(result.message).toContain('Timeout');
    });
  });
});
