import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { lastValueFrom } from 'rxjs';
import {
  Connector,
  ConnectorPayload,
  ConnectorResult,
} from '../../connector.interface';

export interface CmdbuildConfig {
  baseUrl: string;
  username: string;
  password: string;
  className?: string;
}

@Injectable()
export class CmdbuildConnectorService implements Connector {
  readonly name = 'cmdbuild';
  private readonly logger = new Logger(CmdbuildConnectorService.name);

  constructor(private readonly httpService: HttpService) {}

  async execute(payload: ConnectorPayload): Promise<ConnectorResult> {
    const config = payload.payload['config'] as CmdbuildConfig | undefined;
    if (!config?.baseUrl) {
      return { success: false, error: 'Missing CMDBuild config (baseUrl)' };
    }

    try {
      const session = await this.login(config);
      const operation = payload.operation;
      const params = payload.payload['params'] ?? {};

      const response = await this.call(config, operation, params, session);
      this.logger.log(`CMDBuild ${operation} succeeded`);
      return { success: true, data: response };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`CMDBuild operation failed: ${msg}`);
      return { success: false, error: msg };
    }
  }

  private async login(config: CmdbuildConfig): Promise<string> {
    const url = `${config.baseUrl}/sessions`;
    const response = await lastValueFrom(
      this.httpService.post(
        url,
        { username: config.username, password: config.password },
        { headers: { 'Content-Type': 'application/json' }, timeout: 30000 },
      ),
    );
    const data = response.data as { data?: { _id?: string } };
    const sessionId = data.data?._id;
    if (!sessionId) {
      throw new Error('CMDBuild login failed: no session id');
    }
    return sessionId;
  }

  private async call(
    config: CmdbuildConfig,
    operation: string,
    params: unknown,
    sessionId: string,
  ): Promise<unknown> {
    const className = config.className ?? 'User';
    let url: string;
    let method = 'GET';
    let body: unknown = undefined;

    switch (operation) {
      case 'user.create':
        url = `${config.baseUrl}/classes/${className}/cards`;
        method = 'POST';
        body = params;
        break;
      case 'user.update':
        url = `${config.baseUrl}/classes/${className}/cards/${(params as Record<string, string>)['id']}`;
        method = 'PUT';
        body = params;
        break;
      case 'user.delete':
        url = `${config.baseUrl}/classes/${className}/cards/${(params as Record<string, string>)['id']}`;
        method = 'DELETE';
        break;
      case 'role.assign':
        url = `${config.baseUrl}/classes/Role/cards/${(params as Record<string, string>)['roleId']}/relations/${(params as Record<string, string>)['userId']}`;
        method = 'POST';
        break;
      default:
        throw new Error(`Unsupported CMDBuild operation: ${operation}`);
    }

    const response = await lastValueFrom(
      this.httpService.request({
        url,
        method,
        data: body,
        headers: {
          'Content-Type': 'application/json',
          'CMDBuild-Authorization': sessionId,
        },
        timeout: 30000,
      }),
    );
    return response.data;
  }
}
