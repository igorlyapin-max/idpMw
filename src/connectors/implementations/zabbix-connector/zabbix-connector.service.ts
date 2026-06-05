import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { lastValueFrom } from 'rxjs';
import {
  Connector,
  ConnectorPayload,
  ConnectorResult,
} from '../../connector.interface';

export interface ZabbixConfig {
  baseUrl: string;
  username: string;
  password: string;
  apiVersion?: string;
}

@Injectable()
export class ZabbixConnectorService implements Connector {
  readonly name = 'zabbix';
  private readonly logger = new Logger(ZabbixConnectorService.name);

  constructor(private readonly httpService: HttpService) {}

  async execute(payload: ConnectorPayload): Promise<ConnectorResult> {
    const config = payload.payload['config'] as ZabbixConfig | undefined;
    if (!config?.baseUrl) {
      return { success: false, error: 'Missing Zabbix config (baseUrl)' };
    }

    try {
      const auth = await this.login(config);
      const method = payload.operation;
      const params = payload.payload['params'] ?? {};

      const response = await this.call(config.baseUrl, method, params, auth);
      this.logger.log(`Zabbix ${method} succeeded`);
      return { success: true, data: response };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Zabbix operation failed: ${msg}`);
      return { success: false, error: msg };
    }
  }

  private async login(config: ZabbixConfig): Promise<string> {
    const response = await this.call(config.baseUrl, 'user.login', {
      username: config.username,
      password: config.password,
    });
    if (typeof response !== 'string') {
      throw new Error('Zabbix login failed: invalid response');
    }
    return response;
  }

  private async call(
    baseUrl: string,
    method: string,
    params: unknown,
    auth?: string,
  ): Promise<unknown> {
    const body = {
      jsonrpc: '2.0',
      method,
      params,
      id: 1,
      ...(auth ? { auth } : {}),
    };

    const response = await lastValueFrom(
      this.httpService.post(`${baseUrl}/api_jsonrpc.php`, body, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000,
      }),
    );

    const data = response.data as {
      error?: { message: string; data: string };
      result: unknown;
    };
    if (data.error) {
      throw new Error(
        `Zabbix API error: ${data.error.message} — ${data.error.data}`,
      );
    }
    return data.result;
  }

  async testConnection(
    config: Record<string, unknown>,
  ): Promise<{ success: boolean; message: string }> {
    const cfg = config as unknown as ZabbixConfig;
    if (!cfg.baseUrl) {
      return { success: false, message: 'Missing baseUrl in config' };
    }

    try {
      await this.call(cfg.baseUrl, 'apiinfo.version', {});
      return { success: true, message: 'Zabbix API reachable' };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, message: `Zabbix connection failed: ${msg}` };
    }
  }
}
