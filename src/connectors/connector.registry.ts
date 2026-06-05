import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  Connector,
  ConnectorPayload,
  ConnectorResult,
} from './connector.interface';
import { RestConnectorService } from './implementations/rest-connector/rest-connector.service';
import { DbConnectorService } from './implementations/db-connector/db-connector.service';
import { ZabbixConnectorService } from './implementations/zabbix-connector/zabbix-connector.service';
import { CmdbuildConnectorService } from './implementations/cmdbuild-connector/cmdbuild-connector.service';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class ConnectorRegistry implements OnModuleInit {
  private readonly logger = new Logger(ConnectorRegistry.name);
  private readonly connectors = new Map<string, Connector>();
  private readonly staticConnectors = new Map<string, Connector>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly restConnector: RestConnectorService,
    private readonly dbConnector: DbConnectorService,
    private readonly zabbixConnector: ZabbixConnectorService,
    private readonly cmdbuildConnector: CmdbuildConnectorService,
  ) {
    this.registerStatic(this.restConnector);
    this.registerStatic(this.dbConnector);
    this.registerStatic(this.zabbixConnector);
    this.registerStatic(this.cmdbuildConnector);
  }

  async onModuleInit(): Promise<void> {
    await this.reload();
  }

  async reload(): Promise<void> {
    this.connectors.clear();
    for (const [name, connector] of this.staticConnectors) {
      this.connectors.set(name, connector);
    }

    const systems = await this.prisma.targetSystem.findMany({
      where: { enabled: true },
    });

    for (const ts of systems) {
      const proxy = this.createProxy(
        ts.type,
        ts.name,
        ts.config as Record<string, unknown>,
      );
      if (proxy) {
        this.connectors.set(ts.name, proxy);
        this.logger.log(`Registered target system: ${ts.name} (${ts.type})`);
      }
    }
  }

  get(name: string): Connector | undefined {
    return this.connectors.get(name);
  }

  private registerStatic(connector: Connector): void {
    this.staticConnectors.set(connector.name, connector);
  }

  private createProxy(
    type: string,
    name: string,
    config: Record<string, unknown>,
  ): Connector | undefined {
    const baseConnector = this.staticConnectors.get(type);
    if (!baseConnector) {
      this.logger.warn(`No base connector found for type: ${type}`);
      return undefined;
    }

    return {
      name,
      execute: async (payload: ConnectorPayload): Promise<ConnectorResult> => {
        return baseConnector.execute({
          ...payload,
          payload: {
            ...payload.payload,
            config,
          },
        });
      },
    };
  }
}
