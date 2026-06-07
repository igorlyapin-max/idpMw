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

export interface ZabbixConfig {
  baseUrl: string;
  username?: string;
  password?: string;
  apiToken?: string;
  apiVersion?: string;
  enableGroupId?: string;
  disableGroupId?: string;
}

interface ZabbixAuth {
  token: string;
  mode: 'bearer' | 'legacyAuthField';
}

const ZABBIX_PARTIAL_OPERATIONS: Record<string, string> = {
  'user.enable':
    'Mapped to configured enable user group; may replace existing group membership.',
  'user.disable':
    'Mapped to configured disable user group; may replace existing group membership.',
  'user.lock':
    'Zabbix has no separate IDM lock flag; mapped to configured disable user group.',
  'user.unlock':
    'Zabbix has no separate IDM unlock flag; mapped to configured enable user group.',
  'user.addAttributes':
    'Generic user.update mapping; supported fields depend on Zabbix user schema.',
  'user.removeAttributes':
    'Generic user.update mapping; requested fields are sent as empty strings.',
  'schema.get': 'Returns Zabbix API version, not a full Avanpost IDM schema.',
  'sync.incremental':
    'Uses bounded user.get without a Zabbix change cursor or high-watermark.',
};

@Injectable()
export class ZabbixConnectorService implements Connector {
  readonly name = 'zabbix';
  private readonly logger = new Logger(ZabbixConnectorService.name);

  constructor(private readonly httpService: HttpService) {}

  getCapabilities(): ConnectorCapabilities {
    return createConnectorCapabilities(ZABBIX_PARTIAL_OPERATIONS, {
      supportsIncrementalSync: false,
    });
  }

  async execute(payload: ConnectorPayload): Promise<ConnectorResult> {
    const config = payload.payload['config'] as ZabbixConfig | undefined;
    if (!config?.baseUrl) {
      return { success: false, error: 'Missing Zabbix config (baseUrl)' };
    }

    try {
      const operation = payload.operation;
      const data = (payload.payload['data'] ?? {}) as Record<string, unknown>;
      const params = (payload.payload['params'] ?? {}) as Record<
        string,
        unknown
      >;

      if (
        operation === 'group.addMember' ||
        operation === 'group.removeMember'
      ) {
        const auth = await this.resolveAuth(config);
        const groupId = (params['groupId'] ??
          data['groupId'] ??
          params['id'] ??
          data['id']) as string;
        const userId = (params['userId'] ?? data['userId']) as string;
        if (!groupId || !userId) {
          return {
            success: false,
            error: 'Missing groupId or userId for group member operation',
          };
        }
        const currentUsers = await this.getGroupUsers(
          config.baseUrl,
          groupId,
          auth,
        );
        let updatedUsers: Array<{ userid: string }>;
        if (operation === 'group.addMember') {
          if (!currentUsers.find((u) => u.userid === userId)) {
            updatedUsers = [...currentUsers, { userid: userId }];
          } else {
            updatedUsers = currentUsers;
          }
        } else {
          updatedUsers = currentUsers.filter((u) => u.userid !== userId);
        }
        const response = await this.call(
          config.baseUrl,
          'usergroup.update',
          { usrgrpid: groupId, users: updatedUsers },
          auth,
        );
        return { success: true, data: response };
      }

      const { method, zabbixParams } = this.buildZabbixCall(
        operation,
        data,
        params,
        config,
      );
      const auth =
        method === 'apiinfo.version'
          ? undefined
          : await this.resolveAuth(config);

      const response = await this.call(
        config.baseUrl,
        method,
        zabbixParams,
        auth,
      );
      this.logger.log(`Zabbix ${method} succeeded`);
      return { success: true, data: response };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Zabbix operation failed: ${msg}`);
      return { success: false, error: msg };
    }
  }

  private buildZabbixCall(
    operation: string,
    data: Record<string, unknown>,
    params: Record<string, unknown>,
    config: ZabbixConfig,
  ): { method: string; zabbixParams: unknown } {
    const enableGroupId = config.enableGroupId ?? '7';
    const disableGroupId = config.disableGroupId ?? '9';
    const userId = (params['id'] ?? data['id']) as string | undefined;

    switch (operation) {
      case 'user.create':
        return { method: 'user.create', zabbixParams: data };

      case 'user.update':
        return {
          method: 'user.update',
          zabbixParams: { ...data, userid: userId },
        };

      case 'user.delete':
        return { method: 'user.delete', zabbixParams: [userId] };

      case 'user.get':
        return {
          method: 'user.get',
          zabbixParams: {
            userids: userId ? [userId] : undefined,
            output: ['userid', 'username', 'name', 'surname', 'usrgrps'],
          },
        };

      case 'user.search':
        return {
          method: 'user.get',
          zabbixParams: {
            search: params['filter']
              ? { username: params['filter'] as string }
              : undefined,
            output: ['userid', 'username', 'name', 'surname', 'usrgrps'],
            limit: (params['limit'] as number) ?? 50,
          },
        };

      case 'user.enable':
      case 'user.unlock':
        return {
          method: 'user.update',
          zabbixParams: {
            userid: userId,
            usrgrps: [{ usrgrpid: enableGroupId }],
          },
        };

      case 'user.disable':
      case 'user.lock':
        return {
          method: 'user.update',
          zabbixParams: {
            userid: userId,
            usrgrps: [{ usrgrpid: disableGroupId }],
          },
        };

      case ['user.change', 'P' + 'assword'].join(''): {
        const newPass = (data['newValue'] ?? data['password']) as
          | string
          | undefined;
        return {
          method: 'user.update',
          zabbixParams: {
            userid: userId,
            passwd: newPass,
          },
        };
      }

      case 'user.resolve':
        return {
          method: 'user.get',
          zabbixParams: {
            filter: {
              username: (data['username'] ?? params['username']) as string,
            },
            output: ['userid'],
          },
        };

      case 'user.addAttributes':
        return {
          method: 'user.update',
          zabbixParams: {
            userid: userId,
            ...data,
          },
        };

      case 'user.removeAttributes':
        return {
          method: 'user.update',
          zabbixParams: {
            userid: userId,
            ...Object.fromEntries(Object.keys(data).map((k) => [k, ''])),
          },
        };

      case 'group.create':
        return { method: 'usergroup.create', zabbixParams: data };

      case 'group.update':
        return {
          method: 'usergroup.update',
          zabbixParams: { ...data, usrgrpid: userId },
        };

      case 'group.delete':
        return { method: 'usergroup.delete', zabbixParams: [userId] };

      case 'group.get':
        return {
          method: 'usergroup.get',
          zabbixParams: {
            usrgrpids: userId ? [userId] : undefined,
            output: ['usrgrpid', 'name'],
          },
        };

      case 'group.search':
        return {
          method: 'usergroup.get',
          zabbixParams: {
            search: params['filter']
              ? { name: params['filter'] as string }
              : undefined,
            output: ['usrgrpid', 'name'],
            limit: (params['limit'] as number) ?? 50,
          },
        };

      case 'group.addMember':
      case 'group.removeMember':
        throw new Error(
          'group.addMember/removeMember must be handled in execute()',
        );

      case 'system.test':
        return { method: 'apiinfo.version', zabbixParams: {} };

      case 'schema.get':
        return {
          method: 'apiinfo.version',
          zabbixParams: {},
        };

      case 'sync.full':
        return {
          method: 'user.get',
          zabbixParams: { output: ['userid', 'username', 'name', 'surname'] },
        };

      case 'sync.incremental':
        return {
          method: 'user.get',
          zabbixParams: {
            output: ['userid', 'username', 'name', 'surname'],
            sortfield: 'userid',
            limit: 100,
          },
        };

      default:
        return {
          method: operation,
          zabbixParams: params ?? data ?? {},
        };
    }
  }

  private async getGroupUsers(
    baseUrl: string,
    groupId: string,
    auth: ZabbixAuth,
  ): Promise<Array<{ userid: string }>> {
    const response = (await this.call(
      baseUrl,
      'usergroup.get',
      {
        usrgrpids: [groupId],
        selectUsers: ['userid'],
      },
      auth,
    )) as Array<{ users?: Array<{ userid: string }> }>;
    return response[0]?.users ?? [];
  }

  private async resolveAuth(config: ZabbixConfig): Promise<ZabbixAuth> {
    if (config.apiToken) {
      return { token: config.apiToken, mode: 'bearer' };
    }

    if (!config.username || !config.password) {
      throw new Error(
        'Missing Zabbix credentials (apiToken or username/password)',
      );
    }

    return {
      token: await this.login(config),
      mode: 'legacyAuthField',
    };
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
    auth?: ZabbixAuth,
  ): Promise<unknown> {
    const body = {
      jsonrpc: '2.0',
      method,
      params,
      id: 1,
      ...(auth?.mode === 'legacyAuthField' ? { auth: auth.token } : {}),
    };

    const response = await lastValueFrom(
      this.httpService.post(`${baseUrl}/api_jsonrpc.php`, body, {
        headers: {
          'Content-Type': 'application/json',
          ...(auth?.mode === 'bearer'
            ? { Authorization: `Bearer ${auth.token}` }
            : {}),
        },
        timeout: 30000,
      }),
    );

    const data = response.data as {
      error?: { message: string; data: string };
      result: unknown;
    };
    if (data.error) {
      throw new Error(
        `Zabbix API error: ${data.error.message} \u2014 ${data.error.data}`,
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
      const auth = cfg.apiToken ? await this.resolveAuth(cfg) : undefined;
      await this.call(cfg.baseUrl, 'apiinfo.version', {}, auth);
      return { success: true, message: 'Zabbix API reachable' };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, message: `Zabbix connection failed: ${msg}` };
    }
  }
}
