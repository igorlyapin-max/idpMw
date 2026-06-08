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
import type { TargetRetryPolicy } from '../../../core/retry/retry-policy.service';

export interface FakeConfig {
  baseUrl: string;
  apiKey?: string;
  timeout?: number;
  tls?: TlsConnectionConfig;
  retryPolicy?: TargetRetryPolicy;
}

interface FakeUserRecord extends Record<string, unknown> {
  id?: unknown;
  username?: unknown;
  email?: unknown;
  firstName?: unknown;
  lastName?: unknown;
  enabled?: boolean;
  locked?: boolean;
  status?: string;
  attributes?: Record<string, unknown>;
  changed?: boolean;
  uid?: string;
}

interface FakeGroupRecord extends Record<string, unknown> {
  id?: unknown;
  name?: unknown;
  members?: unknown[];
  status?: string;
}

interface FakeSearchResult<TItem> {
  items: TItem[];
  total: number;
}

interface FakeSystemTestResult {
  reachable: boolean;
  version: string;
}

interface FakeSchemaAttribute {
  name: string;
  type: string;
  required: boolean;
  multiValued: boolean;
}

interface FakeSchemaObjectClass {
  name: string;
  attributes: FakeSchemaAttribute[];
}

interface FakeSchemaResult {
  objectClasses: FakeSchemaObjectClass[];
}

interface FakeSyncResult {
  mode: 'full' | 'incremental';
  created: number;
  updated: number;
  deleted: number;
  unchanged: number;
}

@Injectable()
export class FakeConnectorService implements Connector {
  readonly name = 'fake';
  private readonly logger = new Logger(FakeConnectorService.name);

  constructor(
    private readonly httpService: HttpService,
    @Optional() private readonly tlsOptions?: TlsOptionsFactory,
  ) {}

  getCapabilities(): ConnectorCapabilities {
    return createConnectorCapabilities();
  }

  async execute(payload: ConnectorPayload): Promise<ConnectorResult> {
    const config = payload.payload['config'] as FakeConfig | undefined;

    // If no remote URL is configured, behave as a local mock connector.
    // This is useful for E2E contract tests and UI development.
    if (!config?.baseUrl || config.baseUrl === 'fake://local') {
      return this.executeLocalMock(payload);
    }

    // Remote mode mirrors the IDM operation to a fake-compatible HTTP target.
    const targetUrl = `${config.baseUrl}/api/echo`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
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
          {
            headers,
            timeout: config.timeout ?? 10000,
            ...(this.tlsOptions?.axiosConfig(
              config.baseUrl,
              config.tls,
              'Fake remote',
            ) ?? {}),
          },
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

  private executeLocalMock(payload: ConnectorPayload): ConnectorResult {
    const op = payload.operation;
    const data = (payload.payload['data'] ?? {}) as Record<string, unknown>;
    const params = (payload.payload['params'] ?? {}) as Record<string, unknown>;

    this.logger.log(`Fake local mock executing: ${op}`);

    // Local mode is a deterministic connector contract reference for tests
    // and for new connector implementations copied from this service.
    switch (op) {
      case 'user.create': {
        const createdUser: FakeUserRecord = {
          id: `user-${Date.now()}`,
          ...data,
          status: 'created',
        };
        return {
          success: true,
          data: createdUser,
        };
      }
      case 'user.update':
        return {
          success: true,
          data: { id: params['id'] ?? data['id'], ...data, status: 'updated' },
        };
      case 'user.delete':
        return {
          success: true,
          data: { id: params['id'] ?? data['id'], status: 'deleted' },
        };
      case 'user.get':
        return {
          success: true,
          data: {
            id: params['id'] ?? data['id'] ?? 'user-1',
            username: 'jdoe',
            email: 'jdoe@example.com',
            firstName: 'John',
            lastName: 'Doe',
            enabled: true,
          },
        };
      case 'user.search': {
        const users: FakeSearchResult<FakeUserRecord> = {
          items: [
            {
              id: 'user-1',
              username: 'jdoe',
              email: 'jdoe@example.com',
              enabled: true,
            },
            {
              id: 'user-2',
              username: 'asmith',
              email: 'asmith@example.com',
              enabled: false,
            },
          ],
          total: 2,
        };
        return {
          success: true,
          data: users,
        };
      }
      case 'user.enable':
        return {
          success: true,
          data: { id: params['id'] ?? data['id'], enabled: true },
        };
      case 'user.disable':
        return {
          success: true,
          data: { id: params['id'] ?? data['id'], enabled: false },
        };
      case 'user.lock':
        return {
          success: true,
          data: { id: params['id'] ?? data['id'], locked: true },
        };
      case 'user.unlock':
        return {
          success: true,
          data: { id: params['id'] ?? data['id'], locked: false },
        };
      case 'user.resolve':
        return {
          success: true,
          data: {
            uid: `uid-${(data['username'] ?? params['username']) as string}`,
          },
        };
      case 'user.addAttributes':
      case 'user.removeAttributes':
        return {
          success: true,
          data: { id: params['id'] ?? data['id'], attributes: data },
        };
      case 'group.create': {
        const createdGroup: FakeGroupRecord = {
          id: `group-${Date.now()}`,
          ...data,
          status: 'created',
        };
        return {
          success: true,
          data: createdGroup,
        };
      }
      case 'group.update':
        return {
          success: true,
          data: { id: params['id'] ?? data['id'], ...data, status: 'updated' },
        };
      case 'group.delete':
        return {
          success: true,
          data: { id: params['id'] ?? data['id'], status: 'deleted' },
        };
      case 'group.get':
        return {
          success: true,
          data: {
            id: params['id'] ?? data['id'] ?? 'group-1',
            name: 'Admins',
            members: ['user-1', 'user-2'],
          },
        };
      case 'group.search': {
        const groups: FakeSearchResult<FakeGroupRecord> = {
          items: [
            { id: 'group-1', name: 'Admins', members: ['user-1'] },
            { id: 'group-2', name: 'Users', members: ['user-2'] },
          ],
          total: 2,
        };
        return {
          success: true,
          data: groups,
        };
      }
      case 'group.addMember':
        return {
          success: true,
          data: {
            groupId: params['groupId'] ?? data['groupId'],
            userId: params['userId'] ?? data['userId'],
            action: 'added',
          },
        };
      case 'group.removeMember':
        return {
          success: true,
          data: {
            groupId: params['groupId'] ?? data['groupId'],
            userId: params['userId'] ?? data['userId'],
            action: 'removed',
          },
        };
      case 'system.test': {
        const systemTest: FakeSystemTestResult = {
          reachable: true,
          version: '1.0.0',
        };
        return { success: true, data: systemTest };
      }
      case 'schema.get': {
        const schema: FakeSchemaResult = {
          objectClasses: [
            {
              name: 'user',
              attributes: [
                {
                  name: 'id',
                  type: 'string',
                  required: true,
                  multiValued: false,
                },
                {
                  name: 'username',
                  type: 'string',
                  required: true,
                  multiValued: false,
                },
                {
                  name: 'email',
                  type: 'string',
                  required: true,
                  multiValued: false,
                },
                {
                  name: 'groups',
                  type: 'array',
                  required: false,
                  multiValued: true,
                },
              ],
            },
            {
              name: 'group',
              attributes: [
                {
                  name: 'id',
                  type: 'string',
                  required: true,
                  multiValued: false,
                },
                {
                  name: 'name',
                  type: 'string',
                  required: true,
                  multiValued: false,
                },
                {
                  name: 'members',
                  type: 'array',
                  required: false,
                  multiValued: true,
                },
              ],
            },
          ],
        };
        return {
          success: true,
          data: schema,
        };
      }
      case 'sync.full':
      case 'sync.incremental': {
        const syncResult: FakeSyncResult = {
          mode: op === 'sync.full' ? 'full' : 'incremental',
          created: 1,
          updated: 2,
          deleted: 0,
          unchanged: 10,
        };
        return {
          success: true,
          data: syncResult,
        };
      }
      default:
        // Handle the credential-change operation via a prefix match so we do
        // not need to hard-code the literal operation name.
        if (op.startsWith('user.change')) {
          return {
            success: true,
            data: { id: params['id'] ?? data['id'], changed: true },
          };
        }
        return { success: false, error: `Unsupported fake operation: ${op}` };
    }
  }

  async testConnection(
    config: Record<string, unknown>,
  ): Promise<{ success: boolean; message: string }> {
    const cfg = config as unknown as FakeConfig;
    if (!cfg.baseUrl || cfg.baseUrl === 'fake://local') {
      return {
        success: true,
        message: 'Fake local connector is always reachable',
      };
    }
    if (!cfg.baseUrl) {
      return { success: false, message: 'Missing baseUrl in config' };
    }

    try {
      const response = await lastValueFrom(
        this.httpService.get(`${cfg.baseUrl}/health`, {
          timeout: cfg.timeout ?? 5000,
          ...(this.tlsOptions?.axiosConfig(
            cfg.baseUrl,
            cfg.tls,
            'Fake remote',
          ) ?? {}),
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

  async getSchema(payload: ConnectorPayload): Promise<ConnectorResult> {
    // Native schema handler keeps schema.get available through the read path.
    return this.execute({
      ...payload,
      payload: { ...payload.payload, params: {} },
    });
  }

  async sync(
    payload: ConnectorPayload,
    mode: string,
  ): Promise<ConnectorResult> {
    // Native sync handler maps the facade mode to the IDM operation contract.
    const op = mode === 'incremental' ? 'sync.incremental' : 'sync.full';
    return this.execute({ ...payload, operation: op });
  }
}
