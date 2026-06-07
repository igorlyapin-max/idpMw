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
import { FakeConnectorService } from './implementations/fake-connector/fake-connector.service';
import { PrismaService } from '../database/prisma.service';
import { JsonHelper } from '../database/json.helper';

/**
 * ConnectorRegistry — the central routing table for all target systems.
 *
 * Architecture overview
 * =====================
 *
 *  Static connectors (code-level)
 *  ------------------------------
 *  Each connector implementation (Rest, DB, Zabbix, CMDBuild, Fake, …)
 *  is registered once at application startup via `registerStatic()`.
 *  These are the "blueprints" — they know HOW to talk to a system type.
 *
 *  Dynamic proxies (DB-level, multi-instance)
 *  ------------------------------------------
 *  Administrators create TargetSystem rows via Admin UI/API.
 *  Each row has: name, type, config (JSON), enabled.
 *  On `reload()` the registry creates a PROXY for every enabled row.
 *  The proxy wraps the static connector and injects the DB config
 *  into every execute() call.
 *
 *  Why proxies?
 *  ------------
 *  A static connector is stateless — it does not know which instance
 *  of Zabbix to call. The proxy merges the per-instance config
 *  (baseUrl, apiKey, credentials, …) into the payload so the static
 *  connector can use it at runtime.
 *
 *  Routing flow
 *  ============
 *
 *  Webhook ──► Dispatcher ──► ProcessingService.process(dto)
 *                                   │
 *                                   ▼
 *                         this.registry.get(dto.targetSystem)
 *                                   │
 *                                   ├── static name ──► static connector
 *                                   │
 *                                   └── DB name ──────► proxy ──► static connector
 *                                                                   │
 *                                                                   ▼
 *                                                         payload.config = DB config
 *
 *  Example
 *  -------
 *  DB row: { name: 'zabbix-prod', type: 'zabbix',
 *            config: { baseUrl: 'http://z.prod', username: 'u', code: '***' } }
 *
 *  Webhook: { targetSystem: 'zabbix-prod', operation: 'host.create', payload: { data: {} } }
 *
 *  Proxy merges config → payload:
 *    connector.execute({
 *      operation: 'host.create',
 *      targetSystem: 'zabbix-prod',
 *      payload: {
 *        data: {},
 *        config: { baseUrl: 'http://z.prod', username: 'u', code: '***' }
 *      }
 *    })
 *
 *  The ZabbixConnectorService reads payload.config and performs the API call.
 */
@Injectable()
export class ConnectorRegistry implements OnModuleInit {
  private readonly logger = new Logger(ConnectorRegistry.name);

  /** All resolvable connectors: static + dynamic proxies. Key = name or DB row name. */
  private readonly connectors = new Map<string, Connector>();

  /** Blueprint connectors registered from code. Key = connector type (e.g. 'zabbix'). */
  private readonly staticConnectors = new Map<string, Connector>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly jsonHelper: JsonHelper,
    private readonly restConnector: RestConnectorService,
    private readonly dbConnector: DbConnectorService,
    private readonly zabbixConnector: ZabbixConnectorService,
    private readonly cmdbuildConnector: CmdbuildConnectorService,
    private readonly fakeConnector: FakeConnectorService,
  ) {
    // Register static blueprints at startup.
    this.registerStatic(this.restConnector);
    this.registerStatic(this.dbConnector);
    this.registerStatic(this.zabbixConnector);
    this.registerStatic(this.cmdbuildConnector);
    this.registerStatic(this.fakeConnector);
  }

  /** Load dynamic proxies from DB on application startup. */
  async onModuleInit(): Promise<void> {
    await this.reload();
  }

  /**
   * Reload dynamic proxies from the database.
   *
   * Called:
   *   - On application startup (onModuleInit)
   *   - After any TargetSystem CRUD operation (create/update/delete)
   *
   * This ensures that runtime changes in Admin UI are picked up
   * without restarting the application.
   */
  async reload(): Promise<void> {
    this.connectors.clear();

    // Always keep static connectors available (legacy fallback).
    for (const [name, connector] of this.staticConnectors) {
      this.connectors.set(name, connector);
    }

    // Load enabled TargetSystem rows from DB and create proxies.
    const systems = await this.prisma.targetSystem.findMany({
      where: { enabled: true },
    });

    for (const ts of systems) {
      const config =
        this.jsonHelper.fromJson<Record<string, unknown>>(ts.config) ?? {};
      const proxy = this.createProxy(ts.type, ts.name, config);
      if (proxy) {
        this.connectors.set(ts.name, proxy);
        this.logger.log(`Registered target system: ${ts.name} (${ts.type})`);
      }
    }
  }

  /**
   * Resolve a connector by name.
   *
   * @param name  Either a static type ('rest', 'db', …)
   *              or a DB TargetSystem.name ('zabbix-prod', …).
   */
  get(name: string): Connector | undefined {
    return this.connectors.get(name);
  }

  /**
   * Test connectivity for a given connector type.
   *
   * Used by Admin UI when user clicks "Test" on a TargetSystem row.
   * We look up the STATIC connector by type and call its testConnection()
   * with the per-instance config from the DB.
   */
  async testConnection(
    type: string,
    config: Record<string, unknown>,
  ): Promise<{ success: boolean; message: string }> {
    const baseConnector = this.staticConnectors.get(type);
    if (!baseConnector) {
      return {
        success: false,
        message: `No connector found for type: ${type}`,
      };
    }
    return baseConnector.testConnection(config);
  }

  private registerStatic(connector: Connector): void {
    this.staticConnectors.set(connector.name, connector);
  }

  /**
   * Create a proxy connector that wraps a static blueprint.
   *
   * The proxy:
   *   - Keeps the DB row name as its own `name`
   *   - On every `execute()` merges the DB config into `payload.config`
   *   - Delegates the actual HTTP/DB work to the static connector
   *
   * This is how per-instance credentials (baseUrl, apiKey, …)
   * travel from the Admin UI → DB → Proxy → Connector → HTTP request.
   */
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

    const proxy: Connector = {
      name,
      execute: async (payload: ConnectorPayload): Promise<ConnectorResult> => {
        return baseConnector.execute({
          ...payload,
          payload: {
            ...payload.payload,
            config, // <-- inject DB config so the connector can read it
          },
        });
      },
      testConnection: async (): Promise<{
        success: boolean;
        message: string;
      }> => {
        return baseConnector.testConnection(config);
      },
    };

    if (baseConnector.getCapabilities) {
      proxy.getCapabilities = () => baseConnector.getCapabilities!();
    }

    return proxy;
  }
}
