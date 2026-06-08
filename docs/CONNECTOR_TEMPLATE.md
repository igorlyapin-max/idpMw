# Connector template

> Подробные процедуры развёртывания и проверки: [CUSTOM_CONNECTOR_DEPLOYMENT.md](CUSTOM_CONNECTOR_DEPLOYMENT.md)
> Настройка IDM multi-target contract: [IDM_ADMIN_DEPLOYMENT.md](IDM_ADMIN_DEPLOYMENT.md)

`src/connectors/implementations/fake-connector/` является reference template для
новых коннекторов. Он показывает оба режима работы:

- local mock mode для contract/e2e проверок без внешней системы;
- remote mode через HTTP endpoint с `baseUrl`, timeout и `tls`.

Новый connector должен сохранять тот же public contract: Avanpost IDM отправляет
`operation`, `targetSystem` и `payload`, а idmMw маршрутизирует событие через
`ConnectorRegistry`.

Важно: этот Node.js connector interface не является native Avanpost
`IProvisioningConnector` SDK. Native Avanpost connector разрабатывается как
.NET assembly и подключается через Avanpost connector services. В idmMw
connector реализует middleware adapter contract для webhook/BP/event flow.

## Payload contract

`ConnectorPayload.payload` содержит три логические зоны:

```ts
{
  data: { ... },   // body/change data: user fields, group fields, attributes
  params: { ... }, // route/query/read params: id, filter, limit, groupId
  config: { ... }  // injected TargetSystem.config, never supplied by IDM
}
```

Правила:

- `payload.data` используется для write body и изменяемых атрибутов.
- `payload.params` используется для read operations и идентификаторов из route
  или query.
- `payload.config` добавляет `ConnectorRegistry` из DB-backed `TargetSystem`.
- Коннектор не должен читать production URL, passwords или tokens из кода.

## Minimal data structures

Используйте typed interfaces рядом с connector service. Они фиксируют локальный
контракт и упрощают перенос fake connector в реальный connector.

```ts
import type { TlsConnectionConfig } from '../../../security/tls-options.factory';
import type { TargetRetryPolicy } from '../../../core/retry/retry-policy.service';

export interface MySystemConfig {
  baseUrl: string;
  apiKey?: string;
  timeout?: number;
  tls?: TlsConnectionConfig;
  retryPolicy?: TargetRetryPolicy;
}

interface MySystemUser {
  id?: unknown;
  username?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  enabled?: boolean;
  groups?: string[];
}

interface MySystemGroup {
  id?: unknown;
  name?: string;
  members?: string[];
}

interface MySystemSearchResult<TItem> {
  items: TItem[];
  total: number;
}

interface MySystemSchemaAttribute {
  name: string;
  type: string;
  required: boolean;
  multiValued: boolean;
}

interface MySystemSchema {
  objectClasses: Array<{
    name: string;
    attributes: MySystemSchemaAttribute[];
  }>;
}

interface MySystemSyncResult {
  mode: 'full' | 'incremental';
  created: number;
  updated: number;
  deleted: number;
  unchanged?: number;
}
```

`retryPolicy` находится в `TargetSystem.config`, но применяется idmMw
`RetryPolicyService`, а не connector code. Коннектору нужен timeout и корректная
обработка ошибок; глобальный retry поверх idmMw не добавляйте.

## Connector interface

```ts
export interface Connector {
  readonly name: string;
  execute(payload: ConnectorPayload): Promise<ConnectorResult>;
  testConnection(
    config: Record<string, unknown>,
  ): Promise<{ success: boolean; message: string }>;
  getCapabilities?(): ConnectorCapabilities;
  getSchema?(payload: ConnectorPayload): Promise<ConnectorResult>;
  sync?(payload: ConnectorPayload, mode: string): Promise<ConnectorResult>;
}
```

Методы:

| Метод             | Назначение                                                                                                   |
| ----------------- | ------------------------------------------------------------------------------------------------------------ |
| `name`            | Static connector type, например `fake`, `zabbix`, `my-system`.                                               |
| `execute`         | Основная операция; получает `operation`, `targetSystem`, `payload.data`, `payload.params`, `payload.config`. |
| `testConnection`  | Проверка связи из Admin UI/API и `/idm/:targetSystem/test`.                                                  |
| `getCapabilities` | IDM-facing список operations/read/write capabilities.                                                        |
| `getSchema`       | Native handler для `schema.get`, если нужен отдельный flow.                                                  |
| `sync`            | Native handler для `sync.full` / `sync.incremental`.                                                         |

## Service skeleton

```ts
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

export interface MySystemConfig {
  baseUrl: string;
  apiKey?: string;
  timeout?: number;
  tls?: TlsConnectionConfig;
}

@Injectable()
export class MySystemConnectorService implements Connector {
  readonly name = 'my-system';
  private readonly logger = new Logger(MySystemConnectorService.name);

  constructor(
    private readonly httpService: HttpService,
    @Optional() private readonly tlsOptions?: TlsOptionsFactory,
  ) {}

  getCapabilities(): ConnectorCapabilities {
    return createConnectorCapabilities();
  }

  async execute(payload: ConnectorPayload): Promise<ConnectorResult> {
    const config = payload.payload['config'] as MySystemConfig | undefined;
    if (!config?.baseUrl) {
      return { success: false, error: 'Missing config (baseUrl)' };
    }

    const data = (payload.payload['data'] ?? {}) as Record<string, unknown>;
    const params = (payload.payload['params'] ?? {}) as Record<string, unknown>;

    try {
      const response = await lastValueFrom(
        this.httpService.post(
          `${config.baseUrl}/api/idm`,
          {
            operation: payload.operation,
            targetSystem: payload.targetSystem,
            data,
            params,
          },
          {
            headers: {
              'Content-Type': 'application/json',
              ...(config.apiKey ? { 'X-Api-Key': config.apiKey } : {}),
            },
            timeout: config.timeout ?? 10000,
            ...(this.tlsOptions?.axiosConfig(
              config.baseUrl,
              config.tls,
              'MySystem remote',
            ) ?? {}),
          },
        ),
      );
      return { success: true, data: response.data };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`MySystem call failed: ${msg}`);
      return { success: false, error: msg };
    }
  }

  async testConnection(
    config: Record<string, unknown>,
  ): Promise<{ success: boolean; message: string }> {
    const cfg = config as unknown as MySystemConfig;
    if (!cfg.baseUrl) {
      return { success: false, message: 'Missing baseUrl' };
    }

    try {
      const response = await lastValueFrom(
        this.httpService.get(`${cfg.baseUrl}/health`, {
          timeout: cfg.timeout ?? 5000,
          ...(this.tlsOptions?.axiosConfig(
            cfg.baseUrl,
            cfg.tls,
            'MySystem remote',
          ) ?? {}),
        }),
      );
      return {
        success: true,
        message: `Reachable (status ${response.status})`,
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, message: `Connection failed: ${msg}` };
    }
  }

  async getSchema(payload: ConnectorPayload): Promise<ConnectorResult> {
    return this.execute({ ...payload, operation: 'schema.get' });
  }

  async sync(
    payload: ConnectorPayload,
    mode: string,
  ): Promise<ConnectorResult> {
    return this.execute({
      ...payload,
      operation: mode === 'incremental' ? 'sync.incremental' : 'sync.full',
    });
  }
}
```

## Register the connector

Add the service to `src/connectors/connectors.module.ts`:

```ts
import { MySystemConnectorService } from './implementations/my-system/my-system.service';

@Module({
  imports: [HttpModule, PrismaModule],
  providers: [
    ConnectorRegistry,
    RestConnectorService,
    DbConnectorService,
    ZabbixConnectorService,
    CmdbuildConnectorService,
    FakeConnectorService,
    MySystemConnectorService,
  ],
  exports: [ConnectorRegistry],
})
export class ConnectorsModule {}
```

Register it in `src/connectors/connector.registry.ts`:

```ts
constructor(
  private readonly prisma: PrismaService,
  private readonly jsonHelper: JsonHelper,
  private readonly restConnector: RestConnectorService,
  private readonly dbConnector: DbConnectorService,
  private readonly zabbixConnector: ZabbixConnectorService,
  private readonly cmdbuildConnector: CmdbuildConnectorService,
  private readonly fakeConnector: FakeConnectorService,
  private readonly mySystemConnector: MySystemConnectorService,
) {
  this.registerStatic(this.restConnector);
  this.registerStatic(this.dbConnector);
  this.registerStatic(this.zabbixConnector);
  this.registerStatic(this.cmdbuildConnector);
  this.registerStatic(this.fakeConnector);
  this.registerStatic(this.mySystemConnector);
}
```

`ConnectorRegistry` создаст proxy для каждой DB-backed записи
`TargetSystem(type='my-system')` и добавит `TargetSystem.config` в
`payload.config`.

## TargetSystem config

```bash
curl -X POST http://localhost:3010/admin/target-systems \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: <token-if-admin-auth-enabled>" \
  -d '{
    "name": "my-system-prod",
    "type": "my-system",
    "label": "My System Production",
    "config": {
      "baseUrl": "https://api.mysystem.local",
      "apiKey": "REPLACE_ME",
      "timeout": 15000,
      "retryPolicy": {
        "maxRetries": 5,
        "baseDelayMs": 1000,
        "maxDelayMs": 30000,
        "dlqLeaseSeconds": 600,
        "jitter": true
      },
      "tls": {
        "enabled": true,
        "caPath": "/etc/idmmw/tls/target-ca.crt",
        "certPath": "/etc/idmmw/tls/idmmw-client.crt",
        "keyPath": "/etc/idmmw/tls/idmmw-client.key",
        "serverName": "api.mysystem.local",
        "rejectUnauthorized": true
      }
    },
    "enabled": true
  }'
```

Если `ADMIN_AUTH_ENABLED=true`, `/admin/*` API требует admin session; `POST`,
`PATCH` и `DELETE` дополнительно требуют `X-CSRF-Token`.

## Verification

```bash
# Static checks
npm run build
npm test -- my-system

# IDM-facing catalog, no secrets in response
curl -s http://localhost:3010/idm/target-systems | jq .
curl -s http://localhost:3010/idm/target-systems/my-system-prod | jq .

# Connection checks
curl -s http://localhost:3010/idm/my-system-prod/test | jq .
curl -s -X POST http://localhost:3010/admin/target-systems/<id>/test | jq .

# Write webhook
curl -X POST http://localhost:3010/webhooks/avanpost \
  -H "Content-Type: application/json" \
  -d '{"eventId":"test-1:my-system-prod","operation":"user.create","targetSystem":"my-system-prod","payload":{"data":{"username":"jdoe"}}}'

# Mock IDM route names use operation kebab-case
curl -X POST http://localhost:3010/mock-idm/scenario/user-create
curl -X POST http://localhost:3010/mock-idm/scenario/user-update
curl -X POST http://localhost:3010/mock-idm/scenario/user-delete
```
