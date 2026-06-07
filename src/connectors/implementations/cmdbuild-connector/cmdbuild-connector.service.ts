import { Injectable, Logger, Optional } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { lastValueFrom } from 'rxjs';
import {
  Connector,
  ConnectorCapabilities,
  ConnectorPayload,
  ConnectorResult,
} from '../../connector.interface';
import { createConnectorCapabilities } from '../../connector.capabilities';
import {
  TlsConnectionConfig,
  TlsOptionsFactory,
} from '../../../security/tls-options.factory';

export interface CmdbuildConfig {
  baseUrl: string;
  username: string;
  password: string;
  apiPath?: string;
  defaultUserGroupId?: string | number;
  tls?: TlsConnectionConfig;
}

const CMDBUILD_PARTIAL_OPERATIONS: Record<string, string> = {
  'user.delete':
    'CMDBuild REST v3 user DELETE is not available on the test stand; mapped to active=false.',
  'user.lock':
    'CMDBuild user API has no separate IDM lock flag; mapped to active=false.',
  'user.unlock':
    'CMDBuild user API has no separate IDM unlock flag; mapped to active=true.',
  'user.changePassword':
    'CMDBuild REST v3 /users/{id}/password is not available on the test stand; mapped to full PUT /users/{id} with password.',
  'user.addAttributes':
    'Generic PUT on /users/{id}; accepted attributes depend on CMDBuild user model.',
  'user.removeAttributes':
    'Generic PUT on /users/{id}; requested fields are sent as null values.',
  'schema.get':
    'Returns CMDBuild class catalog, not a transformed Avanpost IDM schema.',
  'group.delete':
    'CMDBuild REST v3 role DELETE is not available on the test stand; mapped to active=false.',
  'group.addMember':
    'CMDBuild REST v3 POST /roles/{id}/users fails on the test stand; mapped to full PUT /users/{id} userGroups update.',
  'group.removeMember':
    'CMDBuild REST v3 POST /roles/{id}/users fails on the test stand; mapped to full PUT /users/{id} userGroups update.',
  'group.search':
    'CMDBuild REST v3 /roles filter is ignored on the test stand; connector applies bounded client-side filtering.',
  'sync.incremental':
    'Uses /users without a CMDBuild change cursor or high-watermark.',
};

@Injectable()
export class CmdbuildConnectorService implements Connector {
  readonly name = 'cmdbuild';
  private readonly logger = new Logger(CmdbuildConnectorService.name);

  constructor(
    private readonly httpService: HttpService,
    @Optional() private readonly tlsOptions?: TlsOptionsFactory,
  ) {}

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
        const response = await this.updateUserRoleMembership(
          config,
          roleId,
          userId,
          operation === 'group.addMember',
        );
        return { success: true, data: response };
      }

      const specialResponse = await this.executeStatefulOperation(
        config,
        operation,
        data,
        params,
      );
      if (specialResponse !== undefined) {
        this.logger.log(`CMDBuild ${operation} succeeded`);
        return { success: true, data: specialResponse };
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
        params.set(key, this.toQueryString(value));
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

  private buildSimpleFilter(
    attribute: string,
    value: unknown,
    operator: 'equal' | 'like' = 'like',
  ): string | undefined {
    const normalized = this.firstQueryValue(value);
    if (normalized === undefined) {
      return undefined;
    }
    if (typeof normalized === 'object') {
      return JSON.stringify(normalized);
    }
    const text = this.toQueryString(normalized).trim();
    if (!text) {
      return undefined;
    }
    if (text.startsWith('{') || text.startsWith('[')) {
      return text;
    }

    return JSON.stringify({
      attribute: {
        simple: {
          attribute,
          operator,
          value: [text],
        },
      },
    });
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
        ...(this.tlsOptions?.axiosConfig(
          config.baseUrl,
          config.tls,
          'CMDBuild',
        ) ?? {}),
      }),
    );
    return response.data;
  }

  private async getEntity(
    config: CmdbuildConfig,
    path: string,
  ): Promise<Record<string, unknown>> {
    const response = (await this.call(config, 'GET', path)) as {
      data?: Record<string, unknown>;
    };
    if (!response.data) {
      throw new Error(`CMDBuild entity not found: ${path}`);
    }
    return response.data;
  }

  private async putMerged(
    config: CmdbuildConfig,
    path: string,
    patch: Record<string, unknown>,
  ): Promise<unknown> {
    const current = await this.getEntity(config, path);
    return this.call(config, 'PUT', path, { ...current, ...patch });
  }

  private applyDefaultUserGroup(
    config: CmdbuildConfig,
    data: Record<string, unknown>,
  ): Record<string, unknown> {
    if (
      data['userGroups'] !== undefined ||
      config.defaultUserGroupId === undefined
    ) {
      return data;
    }

    return {
      active: true,
      service: false,
      language: 'en',
      ...data,
      userGroups: [{ _id: config.defaultUserGroupId }],
    };
  }

  private async updateUserRoleMembership(
    config: CmdbuildConfig,
    roleId: string,
    userId: string,
    add: boolean,
  ): Promise<unknown> {
    const user = await this.getEntity(config, `/users/${userId}`);
    const currentGroups = Array.isArray(user['userGroups'])
      ? (user['userGroups'] as Array<Record<string, unknown>>)
      : [];
    const hasRole = currentGroups.some(
      (group) => String(group['_id']) === String(roleId),
    );
    let nextGroups = currentGroups;
    if (add && !hasRole) {
      nextGroups = [...currentGroups, { _id: roleId }];
    } else if (!add) {
      nextGroups = currentGroups.filter(
        (group) => String(group['_id']) !== String(roleId),
      );
    }

    return this.call(config, 'PUT', `/users/${userId}`, {
      ...user,
      userGroups: nextGroups.map((group) => ({ _id: group['_id'] })),
    });
  }

  private toPositiveInteger(value: unknown, fallback: number): number {
    const numeric = Number(value);
    if (!Number.isInteger(numeric) || numeric <= 0) {
      return fallback;
    }
    return numeric;
  }

  private async searchRoles(
    config: CmdbuildConfig,
    filter: unknown,
    limitValue: unknown,
  ): Promise<unknown> {
    const requestedLimit = this.toPositiveInteger(limitValue, 50);
    const sourceLimit = Math.max(requestedLimit, 500);
    const response = (await this.call(
      config,
      'GET',
      this.appendQuery('/roles', { limit: sourceLimit }),
    )) as { data?: Array<Record<string, unknown>>; meta?: unknown };
    const rows = Array.isArray(response.data) ? response.data : [];
    const text = this.firstQueryValue(filter);
    const needle =
      text === undefined
        ? undefined
        : this.toQueryString(text).trim().toLocaleLowerCase();
    const filtered = needle
      ? rows.filter((row) =>
          [row['name'], row['description']]
            .filter((value) => value !== undefined && value !== null)
            .some((value) =>
              this.toQueryString(value).toLocaleLowerCase().includes(needle),
            ),
        )
      : rows;

    return {
      ...response,
      data: filtered.slice(0, requestedLimit),
      meta: {
        ...((response.meta as Record<string, unknown> | undefined) ?? {}),
        total: filtered.length,
      },
    };
  }

  private async executeStatefulOperation(
    config: CmdbuildConfig,
    operation: string,
    data: Record<string, unknown>,
    params: Record<string, unknown>,
  ): Promise<unknown> {
    const id = (params['id'] ?? data['id']) as string | undefined;

    switch (operation) {
      case 'user.create':
        return this.call(
          config,
          'POST',
          '/users',
          this.applyDefaultUserGroup(config, data),
        );

      case 'user.update':
      case 'user.addAttributes':
        return this.putMerged(config, `/users/${id}`, data);

      case 'user.removeAttributes':
        return this.putMerged(
          config,
          `/users/${id}`,
          Object.fromEntries(Object.keys(data).map((key) => [key, null])),
        );

      case 'user.enable':
      case 'user.unlock':
        return this.putMerged(config, `/users/${id}`, { active: true });

      case 'user.disable':
      case 'user.lock':
      case 'user.delete':
        return this.putMerged(config, `/users/${id}`, { active: false });

      case 'user.changePassword': {
        const password = this.firstQueryValue(
          data['newValue'],
          data['password'],
        );
        if (!password) {
          throw new Error('Missing password for user.changePassword');
        }
        return this.putMerged(config, `/users/${id}`, { password });
      }

      case 'group.update':
        return this.putMerged(config, `/roles/${id}`, data);

      case 'group.delete':
        return this.putMerged(config, `/roles/${id}`, { active: false });

      case 'group.search':
        return this.searchRoles(
          config,
          this.firstQueryValue(params['filter'], data['filter']),
          this.firstQueryValue(params['limit'], data['limit']),
        );

      default:
        return undefined;
    }
  }

  private toQueryString(value: unknown): string {
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      typeof value === 'bigint'
    ) {
      return String(value);
    }
    return JSON.stringify(value);
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
            filter: this.buildSimpleFilter(
              'username',
              this.firstQueryValue(params['filter'], data['filter']),
            ),
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
            filter: this.buildSimpleFilter(
              'username',
              this.firstQueryValue(
                params['username'],
                data['username'],
                params['login'],
                data['login'],
                params['filter'],
                data['filter'],
              ),
              'equal',
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
            filter: this.buildSimpleFilter(
              'name',
              this.firstQueryValue(params['filter'], data['filter']),
            ),
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
          ...(this.tlsOptions?.axiosConfig(cfg.baseUrl, cfg.tls, 'CMDBuild') ??
            {}),
        }),
      );
      return { success: true, message: 'CMDBuild API reachable' };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, message: `CMDBuild connection failed: ${msg}` };
    }
  }
}
