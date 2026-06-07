# Шаблон добавления нового REST-коннектора

> **Руководство по развёртыванию:** Подробная документация с процедурами проверки, troubleshooting и security checklist — [CUSTOM_CONNECTOR_DEPLOYMENT.md](CUSTOM_CONNECTOR_DEPLOYMENT.md)

> Время интеграции: ~10 минут
> Живой пример: `src/connectors/implementations/fake-connector/`

## Архитектура

### Полный flow от webhook до коннектора

```
Avanpost IDM
     │
     ▼
POST /webhooks/avanpost  (WebhookController)
     │
     ▼
WebhookService.processWebhook()
     │
     ├── idempotency check (deduplication by eventId)
     │
     ▼
DispatcherService.dispatch()
     │
     ├── ProcessingService.process()  (retry logic)
     │       │
     │       ▼
     │   ConnectorRegistry.get(targetSystem)
     │       │
     │       ├── static connector (legacy mode)
     │       └── proxy ──► static connector + DB config
     │               │
     │               ▼
     │        Concrete Connector (zabbix, cmdbuild, fake, …)
     │               │
     │               ▼
     │        HTTP request with config from payload
     │
     ▼
Kafka event (optional, if KAFKA_ENABLED=true)
```

### Как проносятся настройки подключения

1. **Admin** создаёт `TargetSystem` через UI/API, заполняя поле `config` JSON-объектом с параметрами подключения (baseUrl, таймауты, ключи доступа).

2. **ConnectorRegistry** при старте (или после reload) создаёт `proxy` для каждой записи из БД. Proxy оборачивает статический коннектор и при вызове `execute()` мержит `config` из БД в `payload.config`.

3. **ProcessingService** вызывает `connector.execute()`:

   ```ts
   connector.execute({
     operation: 'host.create',
     targetSystem: 'zabbix-prod',
     payload: {
       data: { ... },
       config: { baseUrl: '...', timeout: 15000 }  // ← из БД
     }
   })
   ```

4. **Конкретный коннектор** читает `payload.config` и строит HTTP запрос. Поля config используются для URL, заголовков, таймаутов.

**Важно:** параметры подключения никогда не хранятся в коде коннектора. Они приходят через `payload.config`, который заполняется в Admin UI и хранится в БД.

### Как мапятся operations

`operation` из webhook передаётся **as-is** через всю цепочку:

```
Webhook:  { operation: 'user.create', ... }
              │
              ▼
Dispatcher ──► ProcessingService.process({ operation: 'user.create' })
              │
              ▼
Connector ──► execute({ operation: 'user.create', ... })
```

Каждый коннектор сам решает, как интерпретировать `operation`:

- **Zabbix** — передаёт как `method` в Zabbix API
- **CMDBuild** — использует `switch(operation)` для выбора URL/method
- **Fake/REST** — может игнорировать или логировать operation

---

## Интерфейс Connector

Каждый коннектор — это класс, реализующий интерфейс `Connector`:

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

| Метод             | Назначение                                                            |
| ----------------- | --------------------------------------------------------------------- |
| `name`            | Уникальный идентификатор типа (`'fake'`, `'zabbix'` …)                |
| `execute`         | Основная операция: отправка данных в целевую систему                  |
| `testConnection`  | Проверка доступности (используется из Admin UI)                       |
| `getCapabilities` | IDM-facing описание поддерживаемых operations и частичных ограничений |
| `getSchema`       | Опциональный native handler для `schema.get`                          |
| `sync`            | Опциональный native handler для `sync.full` / `sync.incremental`      |

Если коннектор обслуживает несколько DB-backed `TargetSystem`, `ConnectorRegistry` прокидывает `getCapabilities()` через proxy. Ответы `GET /idm/target-systems` и `GET /idm/target-systems/:name` используют этот контракт и не возвращают `config` или секреты.

---

## Шаг 1: Создать сервис-коннектор

Скопируй `fake-connector.service.ts` и адаптируй:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { lastValueFrom } from 'rxjs';
import {
  Connector,
  ConnectorPayload,
  ConnectorResult,
} from '../../connector.interface';

export interface MySystemConfig {
  baseUrl: string;
  apiKey?: string;
  timeout?: number;
}

@Injectable()
export class MySystemConnectorService implements Connector {
  readonly name = 'my-system';
  private readonly logger = new Logger(MySystemConnectorService.name);

  constructor(private readonly httpService: HttpService) {}

  async execute(payload: ConnectorPayload): Promise<ConnectorResult> {
    const config = payload.payload['config'] as MySystemConfig | undefined;
    if (!config?.baseUrl) {
      return { success: false, error: 'Missing config (baseUrl)' };
    }

    try {
      const response = await lastValueFrom(
        this.httpService.post(
          `${config.baseUrl}/api/users`,
          payload.payload['data'] ?? {},
          {
            headers: config.apiKey ? { 'X-Api-Key': config.apiKey } : undefined,
            timeout: config.timeout ?? 10000,
          },
        ),
      );
      this.logger.log(`Success: ${response.status}`);
      return { success: true, data: response.data };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed: ${msg}`);
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
      const res = await lastValueFrom(
        this.httpService.get(`${cfg.baseUrl}/health`, {
          timeout: cfg.timeout ?? 5000,
        }),
      );
      return {
        success: true,
        message: `Reachable (status ${res.status})`,
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, message: `Connection failed: ${msg}` };
    }
  }
}
```

**Правила:**

- Всегда валидируй `config` перед использованием
- Всегда оборачивай HTTP вызовы в `try/catch`
- Возвращай понятные сообщения об ошибках
- Не храни чувствительные данные в коде — они приходят через `config`

---

## Шаг 2: Зарегистрировать в модуле

`src/connectors/connectors.module.ts`:

```ts
import { MySystemConnectorService } from './implementations/my-system/my-system.service';

@Module({
  imports: [HttpModule],
  providers: [
    ConnectorRegistry,
    // ... другие коннекторы
    MySystemConnectorService,
  ],
  exports: [ConnectorRegistry],
})
```

---

## Шаг 3: Добавить в ConnectorRegistry

`src/connectors/connector.registry.ts`:

```ts
import { MySystemConnectorService } from './implementations/my-system/my-system.service';

export class ConnectorRegistry implements OnModuleInit {
  constructor(
    // ... другие коннекторы
    private readonly mySystemConnector: MySystemConnectorService,
  ) {
    // ... другие registerStatic
    this.registerStatic(this.mySystemConnector);
  }
}
```

После этого `ConnectorRegistry` автоматически:

- Создаст proxy для каждой `TargetSystem` записи с `type='my-system'`
- Будет мержить `config` из БД в `payload` при вызове `execute`

---

## Шаг 4: Добавить форму в Admin UI

`ui/src/pages/TargetSystemsPage.tsx`:

```ts
const TYPE_OPTIONS = ['zabbix', 'cmdbuild', 'rest', 'db', 'fake', 'my-system'];

const TYPE_FIELDS: Record<string, ConfigField[]> = {
  // ... другие типы
  'my-system': [
    { name: 'baseUrl', label: 'Base URL' },
    { name: 'apiKey', label: 'API Key (optional)' },
    { name: 'timeout', label: 'Timeout ms (optional)' },
  ],
};
```

---

## Шаг 5: Написать unit-тест

Скопируй `fake-connector.service.spec.ts` и адаптируй под свои endpoints.

---

## Шаг 6: Создать TargetSystem через Admin API

```bash
curl -X POST http://localhost:3010/admin/target-systems \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-system-prod",
    "type": "my-system",
    "label": "My System Production",
    "config": {
      "baseUrl": "https://api.mysystem.local",
      "apiKey": "replace-me",
      "timeout": 15000
    },
    "enabled": true
  }'
```

Или через Admin UI: `http://localhost:3010/` → Target Systems → Create.

---

## Проверка

```bash
# 1. Валидация
npm run validate

# 2. Unit тесты
npm test -- my-system

# 3. Проверка связи
POST /admin/target-systems/:id/test

# 4. E2E отправка события
POST /webhooks/avanpost \
  -d '{"eventId":"test-1","operation":"user.create","targetSystem":"my-system-prod","payload":{"data":{"name":"John"}}}'
```
