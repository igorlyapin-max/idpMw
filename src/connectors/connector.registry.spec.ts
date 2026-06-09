import { Test, TestingModule } from '@nestjs/testing';
import { ConnectorRegistry } from './connector.registry';
import { PrismaService } from '../database/prisma.service';
import { JsonHelper } from '../database/json.helper';
import { RestConnectorService } from './implementations/rest-connector/rest-connector.service';
import { DbConnectorService } from './implementations/db-connector/db-connector.service';
import { ZabbixConnectorService } from './implementations/zabbix-connector/zabbix-connector.service';
import { CmdbuildConnectorService } from './implementations/cmdbuild-connector/cmdbuild-connector.service';
import { FakeConnectorService } from './implementations/fake-connector/fake-connector.service';
import { PassworkConnectorService } from './implementations/passwork-connector/passwork-connector.service';

type MockConnector = {
  name: string;
  execute: jest.Mock;
  testConnection: jest.Mock;
  getCapabilities?: jest.Mock;
  getSchema?: jest.Mock;
  sync?: jest.Mock;
};

describe('ConnectorRegistry', () => {
  let registry: ConnectorRegistry;
  let prisma: { targetSystem: { findMany: jest.Mock } };
  let restConnector: MockConnector;
  let dbConnector: MockConnector;
  let zabbixConnector: MockConnector;
  let cmdbuildConnector: MockConnector;
  let fakeConnector: MockConnector;
  let passworkConnector: MockConnector;

  beforeEach(async () => {
    prisma = { targetSystem: { findMany: jest.fn() } };
    restConnector = {
      name: 'rest',
      execute: jest.fn(),
      testConnection: jest.fn(),
    };
    dbConnector = { name: 'db', execute: jest.fn(), testConnection: jest.fn() };
    zabbixConnector = {
      name: 'zabbix',
      execute: jest.fn(),
      testConnection: jest.fn(),
      getCapabilities: jest.fn(),
    };
    cmdbuildConnector = {
      name: 'cmdbuild',
      execute: jest.fn(),
      testConnection: jest.fn(),
    };
    fakeConnector = {
      name: 'fake',
      execute: jest.fn(),
      testConnection: jest.fn(),
    };
    passworkConnector = {
      name: 'passwork',
      execute: jest.fn(),
      testConnection: jest.fn(),
      getCapabilities: jest.fn(),
    };
    const jsonHelper = {
      fromJson: jest.fn((v: unknown) =>
        typeof v === 'string' ? (JSON.parse(v) as Record<string, unknown>) : v,
      ),
      toJson: jest.fn((v: unknown) => v),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConnectorRegistry,
        { provide: PrismaService, useValue: prisma },
        { provide: JsonHelper, useValue: jsonHelper },
        { provide: RestConnectorService, useValue: restConnector },
        { provide: DbConnectorService, useValue: dbConnector },
        { provide: ZabbixConnectorService, useValue: zabbixConnector },
        { provide: CmdbuildConnectorService, useValue: cmdbuildConnector },
        { provide: FakeConnectorService, useValue: fakeConnector },
        { provide: PassworkConnectorService, useValue: passworkConnector },
      ],
    }).compile();

    registry = module.get<ConnectorRegistry>(ConnectorRegistry);
  });

  describe('reload', () => {
    it('should register static and dynamic connectors', async () => {
      prisma.targetSystem.findMany.mockResolvedValue([
        {
          id: '1',
          name: 'z1',
          type: 'zabbix',
          enabled: true,
          config: { url: 'http://z' },
        },
      ]);
      await registry.reload();
      expect(registry.get('zabbix')).toBeDefined();
      expect(registry.get('fake')).toBeDefined();
      expect(registry.get('passwork')).toBeDefined();
      expect(registry.get('z1')).toBeDefined();
    });

    it('should skip unknown types', async () => {
      prisma.targetSystem.findMany.mockResolvedValue([
        { id: '1', name: 'x1', type: 'unknown', enabled: true, config: {} },
      ]);
      await registry.reload();
      expect(registry.get('x1')).toBeUndefined();
    });

    it('should expose base connector capabilities through dynamic proxies', async () => {
      const capabilities = {
        operations: ['user.get'],
        readOperations: ['user.get'],
        writeOperations: [],
        capabilities: {
          supportsRead: true,
          supportsWrite: false,
          supportsSync: false,
          supportsIncrementalSync: false,
          supportsSchema: false,
        },
        operationStatus: { 'user.get': { status: 'implemented' } },
      };
      zabbixConnector.getCapabilities?.mockReturnValue(capabilities);
      prisma.targetSystem.findMany.mockResolvedValue([
        {
          id: '1',
          name: 'z1',
          type: 'zabbix',
          enabled: true,
          config: { url: 'http://z' },
        },
      ]);

      await registry.reload();

      expect(registry.get('z1')?.getCapabilities?.()).toEqual(capabilities);
    });

    it('should register Passwork dynamic target systems', async () => {
      prisma.targetSystem.findMany.mockResolvedValue([
        {
          id: '1',
          name: 'passwork-prod',
          type: 'passwork',
          enabled: true,
          config: { baseUrl: 'https://passwork.local', accessToken: 'secret' },
        },
      ]);
      passworkConnector.execute.mockResolvedValue({
        success: true,
        data: { id: 'u1' },
      });

      await registry.reload();
      const proxy = registry.get('passwork-prod');
      const result = await proxy?.execute({
        operation: 'user.get',
        targetSystem: 'passwork-prod',
        payload: { params: { id: 'u1' } },
      });

      expect(result).toEqual({ success: true, data: { id: 'u1' } });
      expect(passworkConnector.execute).toHaveBeenCalledWith({
        operation: 'user.get',
        targetSystem: 'passwork-prod',
        payload: {
          params: { id: 'u1' },
          config: { baseUrl: 'https://passwork.local', accessToken: 'secret' },
        },
      });
    });

    it('should expose schema and sync handlers through dynamic proxies with config', async () => {
      zabbixConnector.getSchema = jest.fn().mockResolvedValue({
        success: true,
        data: { objectClasses: [] },
      });
      zabbixConnector.sync = jest.fn().mockResolvedValue({
        success: true,
        data: { mode: 'incremental' },
      });
      prisma.targetSystem.findMany.mockResolvedValue([
        {
          id: '1',
          name: 'z1',
          type: 'zabbix',
          enabled: true,
          config: { baseUrl: 'http://z', apiToken: 'secret' },
        },
      ]);

      await registry.reload();

      const proxy = registry.get('z1');
      await proxy?.getSchema?.({
        operation: 'schema.get',
        targetSystem: 'z1',
        payload: { params: {} },
      });
      await proxy?.sync?.(
        {
          operation: 'sync.incremental',
          targetSystem: 'z1',
          payload: { params: {} },
        },
        'incremental',
      );

      expect(zabbixConnector.getSchema).toHaveBeenCalledWith({
        operation: 'schema.get',
        targetSystem: 'z1',
        payload: {
          params: {},
          config: { baseUrl: 'http://z', apiToken: 'secret' },
        },
      });
      expect(zabbixConnector.sync).toHaveBeenCalledWith(
        {
          operation: 'sync.incremental',
          targetSystem: 'z1',
          payload: {
            params: {},
            config: { baseUrl: 'http://z', apiToken: 'secret' },
          },
        },
        'incremental',
      );
    });
  });

  describe('testConnection', () => {
    it('should delegate to base connector', async () => {
      zabbixConnector.testConnection.mockResolvedValue({
        success: true,
        message: 'OK',
      });
      const result = await registry.testConnection('zabbix', {
        baseUrl: 'http://z',
      });
      expect(zabbixConnector.testConnection).toHaveBeenCalledWith({
        baseUrl: 'http://z',
      });
      expect(result.success).toBe(true);
    });

    it('should return error for unknown type', async () => {
      const result = await registry.testConnection('unknown', {});
      expect(result.success).toBe(false);
      expect(result.message).toContain('No connector found');
    });
  });
});
