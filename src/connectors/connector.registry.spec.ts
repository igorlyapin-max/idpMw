import { Test, TestingModule } from '@nestjs/testing';
import { ConnectorRegistry } from './connector.registry';
import { PrismaService } from '../database/prisma.service';
import { RestConnectorService } from './implementations/rest-connector/rest-connector.service';
import { DbConnectorService } from './implementations/db-connector/db-connector.service';
import { ZabbixConnectorService } from './implementations/zabbix-connector/zabbix-connector.service';
import { CmdbuildConnectorService } from './implementations/cmdbuild-connector/cmdbuild-connector.service';

describe('ConnectorRegistry', () => {
  let registry: ConnectorRegistry;
  let prisma: { targetSystem: { findMany: jest.Mock } };
  let restConnector: {
    name: string;
    execute: jest.Mock;
    testConnection: jest.Mock;
  };
  let dbConnector: {
    name: string;
    execute: jest.Mock;
    testConnection: jest.Mock;
  };
  let zabbixConnector: {
    name: string;
    execute: jest.Mock;
    testConnection: jest.Mock;
  };
  let cmdbuildConnector: {
    name: string;
    execute: jest.Mock;
    testConnection: jest.Mock;
  };

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
    };
    cmdbuildConnector = {
      name: 'cmdbuild',
      execute: jest.fn(),
      testConnection: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConnectorRegistry,
        { provide: PrismaService, useValue: prisma },
        { provide: RestConnectorService, useValue: restConnector },
        { provide: DbConnectorService, useValue: dbConnector },
        { provide: ZabbixConnectorService, useValue: zabbixConnector },
        { provide: CmdbuildConnectorService, useValue: cmdbuildConnector },
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
      expect(registry.get('z1')).toBeDefined();
    });

    it('should skip unknown types', async () => {
      prisma.targetSystem.findMany.mockResolvedValue([
        { id: '1', name: 'x1', type: 'unknown', enabled: true, config: {} },
      ]);
      await registry.reload();
      expect(registry.get('x1')).toBeUndefined();
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
