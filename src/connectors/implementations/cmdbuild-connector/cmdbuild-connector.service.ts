import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { lastValueFrom } from 'rxjs';
import {
  Connector,
  ConnectorCapabilities,
  ConnectorPayload,
  ConnectorResult,
} from '../../connector.interface';
import { createConnectorCapabilities } from '../../connector.capabilities';

export interface CmdbuildConfig {
  baseUrl: string;
  username: string;
  password: string;
  apiPath?: string;
}

const CMDBUILD_PARTIAL_OPERATIONS: Record<string, string> = {
  'user.lock':
    'CMDBuild user API has no separate IDM lock flag; mapped to active=false.',
  'user.unlock':
    'CMDBuild user API has no separate IDM unlock flag; mapped to active=true.',
  'user.addAttributes':
    'Generic PUT on /users/{id}; accepted attributes depend on CMDBuild user model.',
  'user.removeAttributes':
    'Generic PUT on /users/{id}; requested fields are sent as null values.',
  'schema.get':
    'Returns CMDBuild class catalog, not a transformed Avanpost IDM schema.',
  'sync.incremental':
    'Uses /users without a CMDBuild change cursor or high-watermark.',
};

@Injectable()
export class CmdbuildConnectorService implements Connector {
  readonly name = 'cmdbuild';
  private readonly logger = new Logger(CmdbuildConnectorService.name);

  constructor(private readonly httpService: HttpService) {}

  getCapabilities(): ConnectorCapabilities {
    return createConnectorCapabilities(CMDBUILD_PARTIAL_OPERATIONS, {
      supportsIncrementalSync: false,
    });
  }

  async execute(payload: ConnectorPayload): Promise<ConnectorResult> {
    const config = payload.payload['config'] as CmdbuildConfig | undefined;
    if (!config?.baseUrl) {
      return { success: false, error: 'Missing CMDBuild config (baseUrl)' };
    }

    try {
      const operation = payload.operation;
      const data = (payload.payload['data'] ?? {}) as Record<string, unknown>;
      const params = (payload.payload['params'] ?? {}) as Record<
        string,
        unknown
      >;

      // Special handling for group member operations to preserve existing members
      if (
        operation === 'group.addMember' ||
        operation === 'group.removeMember'
      ) {
        const roleId = (params['roleId'] ??
          data['roleId'] ??
          params['id'] ??
          data['id']) as string;
        const userId = (params['userId'] ?? data['userId']) as string;
        if (!roleId || !userId) {
          return {
            success: false,
            error: 'Missing roleId or userId for group member operation',
          };
        }
        const currentUsers = await this.getRoleUsers(config, roleId);
        let updatedUsers: Array<{ _id: string | number }>;
        if (operation === 'group.addMember') {
          if (!currentUsers.find((u) => String(u._id) === String(userId))) {
            updatedUsers = [...currentUsers, { _id: userId }];
          } else {
            updatedUsers = currentUsers;
          }
        } else {
          updatedUsers = currentUsers.filter(
            (u) => String(u._id) !== String(userId),
          );
        }
        const response = await this.call(
          config,
          'POST',
          `/roles/${roleId}/users`,
          { users: updatedUsers },
        );
        return { success: true, data: response };
      }

      const { url, method, body } = this.buildRequest(
        config,
        operation,
        data,
        params,
      );
      const response = await this.call(config, method, url, body);
      this.logger.log(`CMDBuild ${operation} succeeded`);
      return { success: true, data: response };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`CMDBuild operation failed: ${msg}`);
      return { success: false, error: msg };
    }
  }

  private getApiPath(config: CmdbuildConfig): string {
    return config.apiPath ?? '/cmdbuild/services/rest/v3';
  }

  private getAuthHeader(config: CmdbuildConfig): string {
    const creds = Buffer.from(`${config.username}:${config.password}`).toString(
      'base64',
    );
    return `Basic ${creds}`;
  }

  private appendQuery(path: string, query: Record<string, unknown>): string {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== '') {
        params.set(key, String(value));
      }
    }
    const suffix = params.toString();
    return suffix ? `${path}?${suffix}` : path;
  }

  private firstQueryValue(...values: unknown[]): unknown {
    return values.find(
      (value) => value !== undefined && value !== null && value !== '',
    );
  }

  private async getRoleUsers(
    config: CmdbuildConfig,
    roleId: string,
  ): Promise<Array<{ _id: string | number }>> {
    const data = await this.call(config, 'GET', `/roles/${roleId}/users`);
    const response = data as { data?: Array<{ _id: string | number }> };
    return response.data ?? [];
  }

  private async call(
    config: CmdbuildConfig,
    method: string,
    path: string,
    body?: unknown,
  ): Promise<unknown> {
    const apiPath = this.getApiPath(config);
    const url = `${config.baseUrl}${apiPath}${path}`;
    const auth = this.getAuthHeader(config);

    const response = await lastValueFrom(
      this.httpService.request({
        url,
        method,
        data: body,
        headers: {
          'Content-Type': 'application/json',
          Authorization: auth,
        },
        timeout: 30000,
      }),
    );
    return response.data;
  }

  private buildRequest(
    config: CmdbuildConfig,
    operation: string,
    data: Record<string, unknown>,
    params: Record<string, unknown>,
  ): { url: string; method: string; body?: unknown } {
    const userId = (params['id'] ?? data['id']) as string | undefined;

    switch (operation) {
      case 'user.create':
        return { url: '/users', method: 'POST', body: data };

      case 'user.update':
        return { url: `/users/${userId}`, method: 'PUT', body: data };

      case 'user.delete':
        return { url: `/users/${userId}`, method: 'DELETE' };

      case 'user.get':
        return { url: `/users/${userId}`, method: 'GET' };

      case 'user.search':
        return {
          url: this.appendQuery('/users', {
            filter: this.firstQueryValue(params['filter'], data['filter']),
            limit: this.firstQueryValue(params['limit'], data['limit']),
          }),
          method: 'GET',
        };

      case 'user.enable':
      case 'user.unlock':
        return {
          url: `/users/${userId}`,
          method: 'PUT',
          body: { active: true },
        };

      case 'user.disable':
      case 'user.lock':
        return {
          url: `/users/${userId}`,
          method: 'PUT',
          body: { active: false },
        };

      case 'user.changePassword': {
        const newPass = data['newValue'] ?? data['password'];
        return {
          url: `/users/${userId}/password`,
          method: 'POST',
          body: { password: newPass },
        };
      }

      case 'user.resolve':
        return {
          url: this.appendQuery('/users', {
            filter: this.firstQueryValue(
              params['username'],
              data['username'],
              params['login'],
              data['login'],
              params['filter'],
              data['filter'],
            ),
          }),
          method: 'GET',
        };

      case 'user.addAttributes':
        return { url: `/users/${userId}`, method: 'PUT', body: data };

      case 'user.removeAttributes':
        return {
          url: `/users/${userId}`,
          method: 'PUT',
          body: Object.fromEntries(Object.keys(data).map((k) => [k, null])),
        };

      case 'group.create':
        return { url: '/roles', method: 'POST', body: data };

      case 'group.update':
        return { url: `/roles/${userId}`, method: 'PUT', body: data };

      case 'group.delete':
        return { url: `/roles/${userId}`, method: 'DELETE' };

      case 'group.get':
        return { url: `/roles/${userId}`, method: 'GET' };

      case 'group.search':
        return {
          url: this.appendQuery('/roles', {
            filter: this.firstQueryValue(params['filter'], data['filter']),
            limit: this.firstQueryValue(params['limit'], data['limit']),
          }),
          method: 'GET',
        };

      case 'system.test':
        return { url: '/classes', method: 'GET' };

      case 'schema.get':
        return { url: '/classes', method: 'GET' };

      case 'sync.full':
      case 'sync.incremental':
        return { url: '/users', method: 'GET' };

      default:
        throw new Error(`Unsupported CMDBuild operation: ${operation}`);
    }
  }

  async testConnection(
    config: Record<string, unknown>,
  ): Promise<{ success: boolean; message: string }> {
    const cfg = config as unknown as CmdbuildConfig;
    if (!cfg.baseUrl) {
      return { success: false, message: 'Missing baseUrl in config' };
    }

    try {
      const apiPath = this.getApiPath(cfg);
      await lastValueFrom(
        this.httpService.get(`${cfg.baseUrl}${apiPath}/classes`, {
          headers: { Authorization: this.getAuthHeader(cfg) },
          timeout: 30000,
        }),
      );
      return { success: true, message: 'CMDBuild API reachable' };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, message: `CMDBuild connection failed: ${msg}` };
    }
  }
}
