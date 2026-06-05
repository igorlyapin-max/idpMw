import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { lastValueFrom } from 'rxjs';
import {
  Connector,
  ConnectorPayload,
  ConnectorResult,
} from '../../connector.interface';

export interface FakeConfig {
  baseUrl: string;
  apiKey?: string;
  timeout?: number;
}

/**
 * FakeConnectorService is a template / mock connector for new REST integrations.
 * It mirrors the payload back and can be used as a starting point for real connectors.
 */
@Injectable()
export class FakeConnectorService implements Connector {
  readonly name = 'fake';
  private readonly logger = new Logger(FakeConnectorService.name);

  constructor(private readonly httpService: HttpService) {}

  async execute(payload: ConnectorPayload): Promise<ConnectorResult> {
    const config = payload.payload['config'] as FakeConfig | undefined;
    if (!config?.baseUrl) {
      return { success: false, error: 'Missing Fake config (baseUrl)' };
    }

    const targetUrl = `${config.baseUrl}/api/echo`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (config.apiKey) {
      headers['X-Api-Key'] = config.apiKey;
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
