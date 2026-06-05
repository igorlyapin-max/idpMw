import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { lastValueFrom } from 'rxjs';
import {
  Connector,
  ConnectorPayload,
  ConnectorResult,
} from '../../connector.interface';

/**
 * Per-instance configuration for the Fake connector.
 *
 * These fields are filled by the administrator in the Admin UI
 * and stored in the TargetSystem.config JSON column.
 *
 * The ConnectorRegistry proxy automatically injects this config
 * into every execute() call as payload.config.
 */
export interface FakeConfig {
  /** Base URL of the remote system, e.g. https://api.example.com */
  baseUrl: string;

  /** Optional identifier — sent as custom header */
  apiKey?: string;

  /** Request timeout in milliseconds (default: 10000) */
  timeout?: number;
}

/**
 * FakeConnectorService — a mock/template connector for new REST integrations.
 *
 * How config values travel through the system:
 * ============================================
 *
 *   Admin UI form
 *        │
 *        ▼
 *   TargetSystem row in DB
 *   { name: 'my-prod', type: 'fake',
 *     config: { baseUrl: 'https://api.example.com', code: 'xxx' } }
 *        │
 *        ▼
 *   ConnectorRegistry.createProxy() — injects config into payload
 *        │
 *        ▼
 *   FakeConnectorService.execute(payload)
 *        │
 *        ├── reads payload.config.baseUrl  → builds request URL
 *        ├── reads payload.config.code     → adds custom header
 *        └── reads payload.config.timeout  → sets HTTP timeout
 *        │
 *        ▼
 *   HTTP POST https://api.example.com/api/echo
 *
 * This pattern is identical for Zabbix, CMDBuild, and any custom connector:
 *   config fields → payload.config → connector reads them → HTTP params.
 */
@Injectable()
export class FakeConnectorService implements Connector {
  readonly name = 'fake';
  private readonly logger = new Logger(FakeConnectorService.name);

  constructor(private readonly httpService: HttpService) {}

  /**
   * Execute an operation against the fake remote system.
   *
   * @param payload  Contains:
   *                 - operation: the IDM operation name (e.g. 'user.create')
   *                 - targetSystem: the DB row name (e.g. 'my-prod')
   *                 - payload.data: the actual business data from the webhook
   *                 - payload.config: the per-instance config injected by the proxy
   */
  async execute(payload: ConnectorPayload): Promise<ConnectorResult> {
    // Extract the per-instance config that the proxy injected.
    const config = payload.payload['config'] as FakeConfig | undefined;
    if (!config?.baseUrl) {
      return { success: false, error: 'Missing Fake config (baseUrl)' };
    }

    const targetUrl = `${config.baseUrl}/api/echo`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // If an identifier is configured, add it as a header.
    // This is how access identifiers travel from DB → HTTP.
    if (config.apiKey) {
      headers['X-Api-Id'] = config.apiKey;
    }

    try {
      const response = await lastValueFrom(
        this.httpService.post(
          targetUrl,
          {
            operation: payload.operation,
            targetSystem: payload.targetSystem,
            data: payload.payload['data'] ?? {},
          },
          { headers, timeout: config.timeout ?? 10000 },
        ),
      );
      this.logger.log(
        `Fake call to ${targetUrl} succeeded: ${response.status}`,
      );
      return { success: true, data: response.data };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Fake call to ${targetUrl} failed: ${msg}`);
      return { success: false, error: msg };
    }
  }

  /**
   * Test connectivity to the remote system.
   *
   * Used by Admin UI when clicking "Test" on a TargetSystem row.
   */
  async testConnection(
    config: Record<string, unknown>,
  ): Promise<{ success: boolean; message: string }> {
    const cfg = config as unknown as FakeConfig;
    if (!cfg.baseUrl) {
      return { success: false, message: 'Missing baseUrl in config' };
    }

    try {
      const response = await lastValueFrom(
        this.httpService.get(`${cfg.baseUrl}/health`, {
          timeout: cfg.timeout ?? 5000,
        }),
      );
      return {
        success: true,
        message: `Fake system reachable (status ${response.status})`,
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, message: `Fake connection failed: ${msg}` };
    }
  }
}
