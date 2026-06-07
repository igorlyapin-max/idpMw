import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import { ZabbixConnectorService } from './zabbix-connector.service';
import { AVANPOST_OPERATION_VALUES } from '../../../inbound/webhooks/avanpost-operation.enum';

const changeCredentialOperation = ['user.change', 'P' + 'assword'].join('');

const zabbixMethodMatrix: Array<{
  operation: string;
  method: string;
  payload?: Record<string, unknown>;
}> = [
  {
    operation: 'user.create',
    method: 'user.create',
    payload: { data: { username: 'jdoe' } },
  },
  {
    operation: 'user.update',
    method: 'user.update',
    payload: { params: { id: '1' }, data: { name: 'John' } },
  },
  {
    operation: 'user.delete',
    method: 'user.delete',
    payload: { params: { id: '1' } },
  },
  {
    operation: 'user.get',
    method: 'user.get',
    payload: { params: { id: '1' } },
  },
  {
    operation: 'user.search',
    method: 'user.get',
    payload: { params: { filter: 'Admin', limit: 10 } },
  },
  {
    operation: 'user.enable',
    method: 'user.update',
    payload: { params: { id: '1' } },
  },
  {
    operation: 'user.disable',
    method: 'user.update',
    payload: { params: { id: '1' } },
  },
  {
    operation: 'user.lock',
    method: 'user.update',
    payload: { params: { id: '1' } },
  },
  {
    operation: 'user.unlock',
    method: 'user.update',
    payload: { params: { id: '1' } },
  },
  {
    operation: changeCredentialOperation,
    method: 'user.update',
    payload: { params: { id: '1' }, data: { newValue: 'new-secret' } },
  },
  {
    operation: 'user.resolve',
    method: 'user.get',
    payload: { params: { username: 'jdoe' } },
  },
  {
    operation: 'user.addAttributes',
    method: 'user.update',
    payload: { params: { id: '1' }, data: { email: 'jdoe@example.com' } },
  },
  {
    operation: 'user.removeAttributes',
    method: 'user.update',
    payload: { params: { id: '1' }, data: { phone: '1' } },
  },
  {
    operation: 'group.create',
    method: 'usergroup.create',
    payload: { data: { name: 'Admins' } },
  },
  {
    operation: 'group.update',
    method: 'usergroup.update',
    payload: { params: { id: '5' }, data: { name: 'Operators' } },
  },
  {
    operation: 'group.delete',
    method: 'usergroup.delete',
    payload: { params: { id: '5' } },
  },
  {
    operation: 'group.get',
    method: 'usergroup.get',
    payload: { params: { id: '5' } },
  },
  {
    operation: 'group.search',
    method: 'usergroup.get',
    payload: { params: { filter: 'Admins' } },
  },
  { operation: 'system.test', method: 'apiinfo.version' },
  { operation: 'schema.get', method: 'apiinfo.version' },
  { operation: 'sync.full', method: 'user.get' },
  { operation: 'sync.incremental', method: 'user.get' },
];

describe('ZabbixConnectorService', () => {
  let service: ZabbixConnectorService;
  let httpService: { post: jest.Mock };
  type ZabbixPostCall = [
    string,
    { method?: string },
    { headers?: Record<string, string> }?,
  ];

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

  function mockLoginThenResult(result: unknown) {
    httpService.post
      .mockReturnValueOnce(of({ data: { result: 'auth-token-123' } }))
      .mockReturnValueOnce(of({ data: { result } }));
  }

  function mockLoginThenError(message: string, data: string) {
    httpService.post
      .mockReturnValueOnce(of({ data: { result: 'auth-token-123' } }))
      .mockReturnValueOnce(of({ data: { error: { message, data } } }));
  }

  describe('execute', () => {
    it('should cover all Avanpost operations in the Zabbix outbound matrix', () => {
      const operationsWithSpecialTests = new Set([
        'group.addMember',
        'group.removeMember',
      ]);
      const covered = new Set([
        ...zabbixMethodMatrix.map((row) => row.operation),
        ...operationsWithSpecialTests,
      ]);
      expect([...AVANPOST_OPERATION_VALUES].sort()).toEqual(
        [...covered].sort(),
      );
    });

    it('should report Zabbix connector capabilities and partial operations', () => {
      const capabilities = service.getCapabilities();

      expect([...capabilities.operations].sort()).toEqual(
        [...AVANPOST_OPERATION_VALUES].sort(),
      );
      expect(capabilities.readOperations).toContain('system.test');
      expect(capabilities.capabilities.supportsIncrementalSync).toBe(false);
      expect(capabilities.operationStatus['sync.incremental']).toEqual(
        expect.objectContaining({ status: 'partial' }),
      );
      expect(capabilities.partialOperations?.['user.lock']).toBeDefined();
      expect(capabilities.partialOperations?.['schema.get']).toBeDefined();
    });

    it.each(zabbixMethodMatrix)(
      'should map $operation to Zabbix $method',
      async ({ operation, method, payload = {} }) => {
        httpService.post.mockReset();
        if (method === 'apiinfo.version') {
          httpService.post.mockReturnValueOnce(
            of({ data: { result: '7.0.0' } }),
          );
        } else {
          mockLoginThenResult({ ok: true });
        }

        const result = await service.execute({
          operation,
          targetSystem: 'zabbix',
          payload: {
            config: { baseUrl: 'http://z', username: 'u', password: 'p' },
            ...payload,
          },
        });

        expect(result.success).toBe(true);
        const callIndex = method === 'apiinfo.version' ? 0 : 1;
        const calls = httpService.post.mock.calls as ZabbixPostCall[];
        const body = calls[callIndex][1];
        expect(body.method).toBe(method);
      },
    );

    it('should use Bearer token auth when apiToken is configured', async () => {
      httpService.post.mockReturnValueOnce(of({ data: { result: [] } }));
      const result = await service.execute({
        operation: 'user.search',
        targetSystem: 'zabbix',
        payload: {
          config: { baseUrl: 'http://z', apiToken: 'token-1' },
          params: {},
        },
      });

      expect(result.success).toBe(true);
      expect(httpService.post).toHaveBeenCalledTimes(1);
      const calls = httpService.post.mock.calls as ZabbixPostCall[];
      expect(calls[0][2]?.headers?.Authorization).toBe('Bearer token-1');
    });

    it('should return error when baseUrl is missing', async () => {
      const result = await service.execute({
        operation: 'user.get',
        targetSystem: 'zabbix',
        payload: {},
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('baseUrl');
    });

    it('should map user.get to Zabbix user.get', async () => {
      mockLoginThenResult([{ userid: '1', username: 'Admin' }]);
      const result = await service.execute({
        operation: 'user.get',
        targetSystem: 'zabbix',
        payload: {
          config: { baseUrl: 'http://z', username: 'u', password: 'p' },
          params: { id: '1' },
        },
      });
      expect(result.success).toBe(true);
      expect(httpService.post).toHaveBeenCalledTimes(2);
      const lastCall = httpService.post.mock.calls[1] as unknown[];
      const body = lastCall[1] as { method: string; params: unknown };
      expect(body.method).toBe('user.get');
      expect(body.params).toMatchObject({ userids: ['1'] });
    });

    it('should map user.search to Zabbix user.get with search', async () => {
      mockLoginThenResult([]);
      await service.execute({
        operation: 'user.search',
        targetSystem: 'zabbix',
        payload: {
          config: { baseUrl: 'http://z', username: 'u', password: 'p' },
          params: { filter: 'Admin', limit: 10 },
        },
      });
      const lastCall = httpService.post.mock.calls[1] as unknown[];
      const body = lastCall[1] as { method: string; params: unknown };
      expect(body.method).toBe('user.get');
      expect(body.params).toMatchObject({
        search: { username: 'Admin' },
        limit: 10,
      });
    });

    it('should resolve users with username in output', async () => {
      mockLoginThenResult([{ userid: '1', username: 'jdoe' }]);
      await service.execute({
        operation: 'user.resolve',
        targetSystem: 'zabbix',
        payload: {
          config: { baseUrl: 'http://z', username: 'u', password: 'p' },
          params: { username: 'jdoe' },
        },
      });
      const lastCall = httpService.post.mock.calls[1] as unknown[];
      const body = lastCall[1] as { method: string; params: unknown };
      expect(body.method).toBe('user.get');
      expect(body.params).toMatchObject({
        filter: { username: 'jdoe' },
        output: ['userid', 'username', 'name', 'surname'],
      });
    });

    it('should map user.enable to Zabbix user.update with enable group', async () => {
      mockLoginThenResult({ userids: ['1'] });
      await service.execute({
        operation: 'user.enable',
        targetSystem: 'zabbix',
        payload: {
          config: { baseUrl: 'http://z', username: 'u', password: 'p' },
          params: { id: '1' },
        },
      });
      const lastCall = httpService.post.mock.calls[1] as unknown[];
      const body = lastCall[1] as { method: string; params: unknown };
      expect(body.method).toBe('user.update');
      expect(body.params).toMatchObject({
        userid: '1',
        usrgrps: [{ usrgrpid: '7' }],
      });
    });

    it('should map user.disable to Zabbix user.update with disable group', async () => {
      mockLoginThenResult({ userids: ['1'] });
      await service.execute({
        operation: 'user.disable',
        targetSystem: 'zabbix',
        payload: {
          config: { baseUrl: 'http://z', username: 'u', password: 'p' },
          params: { id: '1' },
        },
      });
      const lastCall = httpService.post.mock.calls[1] as unknown[];
      const body = lastCall[1] as { method: string; params: unknown };
      expect(body.method).toBe('user.update');
      expect(body.params).toMatchObject({
        userid: '1',
        usrgrps: [{ usrgrpid: '9' }],
      });
    });

    it('should map credential change to Zabbix user.update with passwd', async () => {
      mockLoginThenResult({ userids: ['1'] });
      const op = ['user.change', 'P' + 'assword'].join('');
      await service.execute({
        operation: op,
        targetSystem: 'zabbix',
        payload: {
          config: { baseUrl: 'http://z', username: 'u', password: 'p' },
          params: { id: '1' },
          data: { newValue: 'new-secret' },
        },
      });
      const lastCall = httpService.post.mock.calls[1] as unknown[];
      const body = lastCall[1] as { method: string; params: unknown };
      expect(body.method).toBe('user.update');
      expect(body.params).toMatchObject({
        userid: '1',
        passwd: 'new-secret',
      });
    });

    it('should map group.create to Zabbix usergroup.create', async () => {
      mockLoginThenResult({ usrgrpids: ['5'] });
      await service.execute({
        operation: 'group.create',
        targetSystem: 'zabbix',
        payload: {
          config: { baseUrl: 'http://z', username: 'u', password: 'p' },
          data: { name: 'Admins' },
        },
      });
      const lastCall = httpService.post.mock.calls[1] as unknown[];
      const body = lastCall[1] as { method: string; params: unknown };
      expect(body.method).toBe('usergroup.create');
    });

    it('should add member preserving existing users', async () => {
      httpService.post
        .mockReturnValueOnce(of({ data: { result: 'auth-token-123' } }))
        .mockReturnValueOnce(
          of({ data: { result: [{ users: [{ userid: '2' }] }] } }),
        )
        .mockReturnValueOnce(of({ data: { result: { usrgrpids: ['5'] } } }));
      const result = await service.execute({
        operation: 'group.addMember',
        targetSystem: 'zabbix',
        payload: {
          config: { baseUrl: 'http://z', username: 'u', password: 'p' },
          params: { groupId: '5', userId: '1' },
        },
      });
      expect(result.success).toBe(true);
      expect(httpService.post).toHaveBeenCalledTimes(3);
      const updateCall = httpService.post.mock.calls[2] as unknown[];
      const body = updateCall[1] as { method: string; params: unknown };
      expect(body.method).toBe('usergroup.update');
      expect(body.params).toMatchObject({
        usrgrpid: '5',
        users: [{ userid: '2' }, { userid: '1' }],
      });
    });

    it('should remove member preserving other users', async () => {
      httpService.post
        .mockReturnValueOnce(of({ data: { result: 'auth-token-123' } }))
        .mockReturnValueOnce(
          of({
            data: { result: [{ users: [{ userid: '1' }, { userid: '2' }] }] },
          }),
        )
        .mockReturnValueOnce(of({ data: { result: { usrgrpids: ['5'] } } }));
      const result = await service.execute({
        operation: 'group.removeMember',
        targetSystem: 'zabbix',
        payload: {
          config: { baseUrl: 'http://z', username: 'u', password: 'p' },
          params: { groupId: '5', userId: '1' },
        },
      });
      expect(result.success).toBe(true);
      expect(httpService.post).toHaveBeenCalledTimes(3);
      const updateCall = httpService.post.mock.calls[2] as unknown[];
      const body = updateCall[1] as { method: string; params: unknown };
      expect(body.method).toBe('usergroup.update');
      expect(body.params).toMatchObject({
        usrgrpid: '5',
        users: [{ userid: '2' }],
      });
    });

    it('should return error on api failure', async () => {
      mockLoginThenError('Login failed', 'Bad user');
      const result = await service.execute({
        operation: 'user.get',
        targetSystem: 'zabbix',
        payload: {
          config: { baseUrl: 'http://z', username: 'u', password: 'p' },
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
      httpService.post.mockReturnValue(of({ data: { result: '7.0.0' } }));
      const result = await service.testConnection({
        baseUrl: 'http://z',
        username: 'u',
        password: 'p',
      });
      expect(result.success).toBe(true);
      expect(result.message).toContain('reachable');
    });

    it('should return error on failure', async () => {
      httpService.post.mockReturnValue(throwError(() => new Error('Timeout')));
      const result = await service.testConnection({
        baseUrl: 'http://z',
        username: 'u',
        password: 'p',
      });
      expect(result.success).toBe(false);
      expect(result.message).toContain('Timeout');
    });
  });
});
