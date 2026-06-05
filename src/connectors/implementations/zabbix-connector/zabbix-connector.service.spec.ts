import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import { ZabbixConnectorService } from './zabbix-connector.service';

describe('ZabbixConnectorService', () => {
  let service: ZabbixConnectorService;
  let httpService: { post: jest.Mock };

  beforeEach(async () => {
    httpService = { post: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ZabbixConnectorService,
        { provide: HttpService, useValue: httpService },
      ],
    }).compile();

    service = module.get<ZabbixConnectorService>(ZabbixConnectorService);
  });

  describe('execute', () => {
    it('should return error when baseUrl is missing', async () => {
      const result = await service.execute({
        operation: 'host.get',
        targetSystem: 'zabbix',
        payload: {},
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('baseUrl');
    });

    it('should call api and return result', async () => {
      httpService.post.mockReturnValue(of({ data: { result: 'abc123' } }));
      const result = await service.execute({
        operation: 'host.get',
        targetSystem: 'zabbix',
        payload: {
          config: { baseUrl: 'http://z', username: 'u', key: 'k' },
          params: {},
        },
      });
      expect(result.success).toBe(true);
      expect(result.data).toBe('abc123');
    });

    it('should return error on api failure', async () => {
      httpService.post.mockReturnValue(
        of({
          data: {
            error: { message: 'Login failed', data: 'Bad user' },
          },
        }),
      );
      const result = await service.execute({
        operation: 'host.get',
        targetSystem: 'zabbix',
        payload: {
          config: { baseUrl: 'http://z', username: 'u', key: 'k' },
          params: {},
        },
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Login failed');
    });
  });

  describe('testConnection', () => {
    it('should return error when baseUrl is missing', async () => {
      const result = await service.testConnection({});
      expect(result.success).toBe(false);
      expect(result.message).toContain('baseUrl');
    });

    it('should return success when api is reachable', async () => {
      httpService.post.mockReturnValue(of({ data: { result: '6.0.0' } }));
      const result = await service.testConnection({
        baseUrl: 'http://z',
        username: 'u',
        key: 'k',
      });
      expect(result.success).toBe(true);
      expect(result.message).toContain('reachable');
    });

    it('should return error on failure', async () => {
      httpService.post.mockReturnValue(throwError(() => new Error('Timeout')));
      const result = await service.testConnection({
        baseUrl: 'http://z',
        username: 'u',
        key: 'k',
      });
      expect(result.success).toBe(false);
      expect(result.message).toContain('Timeout');
    });
  });
});
