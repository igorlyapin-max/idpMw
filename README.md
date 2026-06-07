# idmMw — Middleware для Avanpost IDM 7.8

Промежуточный слой (integration hub) между Avanpost IDM 7.8 и целевыми системами. Обеспечивает идемпотентность, retry с экспоненциальным backoff, DLQ (Dead Letter Queue), audit log и административный UI.

## Стек

- **Backend:** Node.js 20+, NestJS 11+, TypeScript strict
- **Frontend:** React 18, Vite, TypeScript
- **Database:** PostgreSQL 15+ (dev) / CockroachDB или YugabyteDB (prod)
- **ORM:** Prisma
- **Cache/Lock:** PostgreSQL idempotency store; Redis зарезервирован, но не реализован в текущей сборке
- **Message Bus (опц.):** Apache Kafka 3.x
- **Monitoring:** Prometheus + Grafana
- **Logging:** pino (JSON) в stdout/stderr, опционально второй sink в JSON log file

## Быстрый старт

### Требования

- Node.js 20+
- Docker + Docker Compose
- PostgreSQL (или Docker)

### Установка

```bash
npm install
```

### Dev окружение

```bash
# Поднять PostgreSQL
docker compose -f docker-compose.dev.yml up -d

# Применить миграции
npx prisma migrate dev

# Запустить backend
cp .env.example .env
npm run start:dev
```

Backend доступен на `http://localhost:3010`.

### Сборка и запуск UI

```bash
cd ui
npm install
npm run build
```

UI раздаётся NestJS автоматически при `ADMIN_UI_ENABLED=true`.

### Monitoring

```bash
docker compose -f docker-compose.monitoring.yml up -d
```

- Prometheus: `http://localhost:9090`
- Grafana: `http://localhost:3000` (admin/admin)
- Метрики приложения: `http://localhost:3010/metrics`

## Архитектура

### Компоненты

| Компонент          | Описание                                                    |
| ------------------ | ----------------------------------------------------------- |
| Webhook Controller | Приём событий от Avanpost IDM (`POST /webhooks/avanpost`)   |
| Idempotency        | Предотвращение дубликатов через PostgreSQL `IdempotencyKey` |
| Retry              | Экспоненциальный backoff, max 3 попытки                     |
| DLQ                | Хранение неуспешных событий для ручной обработки            |
| Audit              | Логирование всех входящих и исходящих вызовов               |
| Dispatcher         | Маршрутизация событий → коннекторы                          |
| Connectors         | REST, DB (SQL через knex), Zabbix, CMDBuild                 |
| Kafka (опц.)       | Async producer/consumer для масштабирования                 |
| Admin API          | DLQ management, Target Systems management                   |
| Admin UI           | React-приложение для управления DLQ и Target Systems        |

### IDM multi-target contract

Avanpost IDM взаимодействует с одним endpoint микросервиса:

```text
POST /webhooks/avanpost
```

Один запрос адресован одной целевой системе. Для работы с несколькими системами IDM отправляет несколько запросов в тот же endpoint, меняя `targetSystem` и используя уникальный `eventId` на пару бизнес-событие + целевая система:

```json
{
  "eventId": "idm-1001:zabbix-prod",
  "operation": "user.create",
  "targetSystem": "zabbix-prod",
  "payload": {
    "data": {
      "username": "ivanov"
    }
  }
}
```

`targetSystem` должен совпадать либо со static connector name (`fake`, `rest`, `db`, `zabbix`, `cmdbuild`), либо с `TargetSystem.name` из БД (`zabbix-prod`, `cmdbuild-prod`, `portal-hr`).

Для явной проверки доступных систем middleware отдаёт IDM-facing catalog:

```text
GET /idm/target-systems
GET /idm/target-systems/:name
```

Каталог содержит только включённые `TargetSystem` из БД, которые доступны через `ConnectorRegistry`. В ответе нет `config`, токенов, паролей и других секретов. Для каждой системы возвращаются `operations`, `readOperations`, `writeOperations`, `capabilities`, `operationStatus` и `partialOperations`, если часть операций реализована с ограниченной семантикой. Это не автоматический service discovery Avanpost IDM: IDM по-прежнему вызывает один endpoint middleware, а список используется как контракт/справочник для настройки нескольких систем за одним микросервисом.

Поддерживаемые IDM operations:

```text
user.create, user.update, user.delete, user.get, user.search,
user.enable, user.disable, user.lock, user.unlock, user.changePassword,
user.resolve, user.addAttributes, user.removeAttributes,
group.create, group.update, group.delete, group.get, group.search,
group.addMember, group.removeMember,
system.test, schema.get, sync.full, sync.incremental
```

Response semantics:

| Тип операции                                                                      | Поведение                                                                                                                                                                                                                                       |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Write (`user.create`, `group.addMember`, ...)                                     | Возвращает `received=true`, `processed=true`, без `data`. Если коннектор вернул сбой после retry, событие уходит в DLQ и запрос считается принятым. Системные ошибки маршрутизации, например неизвестный `targetSystem`, возвращают HTTP error. |
| Read/test/sync (`user.get`, `user.search`, `system.test`, `schema.get`, `sync.*`) | Возвращает `received=true`, `processed=true`, `data` с результатом целевой системы. При ошибке возвращается HTTP error, без DLQ/retry.                                                                                                          |
| Duplicate `eventId`                                                               | Возвращает `received=true`, `processed=false`; dispatch в целевую систему не выполняется.                                                                                                                                                       |

### Feature-флаги

Все опциональные компоненты управляются через env-переменные:

```env
REDIS_ENABLED=false          # true запрещён до реализации Redis store
KAFKA_ENABLED=false          # true для async messaging
DB_CONNECTOR_ENABLED=false   # true для SQL-коннектора
ADMIN_UI_ENABLED=true        # true для раздачи React UI
DebugLogging__Enabled=false  # true для diagnostic logging
DebugLogging__Level=Basic    # Basic | Verbose
LOG_SINK=stdout              # stdout | file
LOG_FILE_PATH=/tmp/idmmw.log # используется при LOG_SINK=file
```

### Модель данных (Prisma)

- **AuditLog** — запись всех webhook и исходящих вызовов
- **DlqItem** — неуспешные события (status: pending, retrying, skipped, resolved)
- **IdempotencyKey** — ключи для deduplication
- **TargetSystem** — конфигурация целевых систем (Zabbix, CMDBuild, REST, DB)

## Легковесный режим (SQLite)

Для dev и маленьких инсталляций доступен режим на SQLite — без PostgreSQL, Redis, Kafka:

```bash
# Настройка SQLite (один раз)
npm run db:setup:sqlite

# Запуск в lightweight режиме
npm run dev:sqlite
```

Переменные окружения для SQLite:

```env
LIGHTWEIGHT_MODE=true
DATABASE_PROVIDER=sqlite
DATABASE_URL=file:./data/idmmw.db
```

В lightweight режиме:

- База данных — SQLite (файл `data/idmmw.db`)
- Kafka и Redis автоматически отключены
- Single worker (no clustering)
- JSON поля хранятся как сериализованные строки

## Env-переменные

```env
# App
PORT=3010
NODE_ENV=development

# Database (обязательно)
DATABASE_URL=postgresql://user:pass@host:port/db

# Redis (опционально)
REDIS_ENABLED=false          # true сейчас запрещён: Redis store не реализован
REDIS_HOST=localhost
REDIS_PORT=6379
# REDIS_SENTINEL_HOSTS=redis1:26379,redis2:26379,redis3:26379  # prod only

# Kafka (опционально)
KAFKA_ENABLED=false
KAFKA_BROKERS=localhost:9092

# DB Connector (опционально)
DB_CONNECTOR_ENABLED=false
DB_CONNECTOR_URL=postgresql://...
DB_CONNECTOR_DIALECT=pg          # pg | mysql2 | sqlite3

# Admin UI
ADMIN_UI_ENABLED=true
ADMIN_UI_SERVE_STATIC=true

# Mock IDM (только dev/test)
MOCK_IDM_ENABLED=true

# Diagnostic logging
DebugLogging__Enabled=false
DebugLogging__Level=Basic    # Basic | Verbose
LOG_SINK=stdout              # stdout | file
LOG_FILE_PATH=/tmp/idmmw.log
```

## API Endpoints

| Метод  | Путь                               | Описание                                          |
| ------ | ---------------------------------- | ------------------------------------------------- |
| GET    | `/health`                          | Health check: DB ping + Redis/Kafka config state  |
| POST   | `/webhooks/avanpost`               | Приём событий от Avanpost IDM                     |
| GET    | `/idm/target-systems`              | IDM-facing каталог включённых целевых систем      |
| GET    | `/idm/target-systems/:name`        | IDM-facing карточка целевой системы               |
| GET    | `/idm/:targetSystem/test`          | Read facade: `system.test` целевой системы        |
| GET    | `/idm/:targetSystem/users`         | Read facade: список пользователей целевой системы |
| GET    | `/idm/:targetSystem/users/resolve` | Read facade: resolve пользователя                 |
| GET    | `/idm/:targetSystem/users/:id`     | Read facade: пользователь целевой системы         |
| GET    | `/idm/:targetSystem/groups`        | Read facade: список групп целевой системы         |
| GET    | `/idm/:targetSystem/groups/:id`    | Read facade: группа целевой системы               |
| GET    | `/idm/:targetSystem/schema`        | Read facade: schema целевой системы               |
| POST   | `/idm/:targetSystem/sync`          | Read facade: `sync.full` или `sync.incremental`   |
| GET    | `/admin/dlq`                       | Список DLQ (фильтры, пагинация)                   |
| POST   | `/admin/dlq/:id/retry`             | Повторная обработка                               |
| POST   | `/admin/dlq/:id/skip`              | Пропустить событие                                |
| GET    | `/metrics`                         | Prometheus метрики                                |
| GET    | `/api`                             | Swagger UI                                        |
| GET    | `/admin/target-systems`            | Список target systems                             |
| POST   | `/admin/target-systems`            | Создать target system                             |
| PATCH  | `/admin/target-systems/:id`        | Обновить target system                            |
| DELETE | `/admin/target-systems/:id`        | Удалить target system                             |
| POST   | `/admin/target-systems/:id/test`   | Проверить связь                                   |

## Mock IDM (dev/test)

Модуль для тестирования без реального Avanpost IDM:

```bash
POST /mock-idm/scenario/create-user   # Создание пользователя
POST /mock-idm/scenario/update-user   # Обновление
POST /mock-idm/scenario/delete-user   # Удаление
POST /mock-idm/scenario/duplicate     # Дубликат (проверка idempotency)
POST /mock-idm/scenario/malformed     # Невалидный payload
POST /mock-idm/scenario/fail          # Ошибка коннектора → DLQ
```

## Тестирование

```bash
# Unit tests
npm run test

# E2E tests
npm run test:e2e

# E2E contract tests with isolated SQLite database
npm run test:e2e:sqlite

# Runtime smoke: build, startup, /health, /metrics,
# Verbose diagnostics, redaction and file log sink
npm run test:runtime-smoke

# Full local validation gate
./scripts/validate-structure.sh

# Нагрузочное тестирование
npx autocannon -c 10 -d 10 -m POST \
  -H "Content-Type: application/json" \
  -b '{"eventId":"load-1","operation":"user.create","targetSystem":"fake","payload":{"data":{"username":"load-user"}}}' \
  http://localhost:3010/webhooks/avanpost

# Валидация
npm run validate
```

## Troubleshooting

### Приложение не запускается

```bash
# Проверить конфигурацию
npm run validate

# Проверить подключение к БД
docker compose -f docker-compose.dev.yml ps

# Проверить логи
tail -f /tmp/idmmw.log
```

### DLQ растёт

1. Проверить метрики: `curl http://localhost:3010/metrics | grep dlq_size`
2. Проверить ошибки коннекторов: `grep "connector" /tmp/idmmw.log`
3. Ручной retry через Admin UI или API:
   ```bash
   curl -X POST http://localhost:3010/admin/dlq/<id>/retry
   ```

### Kafka не подключается

- Убедиться, что `KAFKA_ENABLED=true` и `KAFKA_BROKERS` корректны
- При `KAFKA_ENABLED=false` middleware работает синхронно (без потери функциональности)

### Redis недоступен

- Текущая сборка использует PostgreSQL idempotency store.
- `REDIS_ENABLED=true` завершает startup ошибкой, потому что Redis store не реализован и не должен молча принимать события в неверном режиме.
- Для dev/test/prod pilot оставляйте `REDIS_ENABLED=false`.

### Diagnostic logging

- По умолчанию diagnostic logging выключен.
- `DebugLogging__Enabled=true` включает diagnostic события через основной structured logging pipeline.
- `DebugLogging__Level=Basic` пишет безопасные события маршрутизации без payload.
- `DebugLogging__Level=Verbose` временно пишет расширенные diagnostic события с маскированием секретов.
- `LOG_SINK=file` добавляет второй JSON file sink в `LOG_FILE_PATH` для collector/sidecar; stdout/stderr остаётся включённым.
- `npm run test:runtime-smoke` проверяет реальный startup с `DebugLogging__Level=Verbose`, webhook diagnostics и отсутствие утечки password/token в log sink.

## Custom connector deployment

Подробное руководство по созданию и развёртыванию пользовательского коннектора:
[docs/CUSTOM_CONNECTOR_DEPLOYMENT.md](docs/CUSTOM_CONNECTOR_DEPLOYMENT.md)

## Multi-instance target systems

Приложение поддерживает динамическую загрузку коннекторов из БД. Каждая запись `TargetSystem` описывает отдельный инстанс целевой системы:

```bash
# Пример: создать инстанс Zabbix
POST /admin/target-systems
{
  "name": "zabbix-prod",
  "type": "zabbix",
  "label": "Zabbix Production",
  "config": {
    "baseUrl": "http://zabbix.local",
    "apiToken": "..."
  },
  "enabled": true
}
```

Поддерживаемые типы: `zabbix`, `cmdbuild`, `rest`, `db`, `fake`.

## Лицензия

UNLICENSED

## Управление секретами (Indeed PAM AAPM)

Для production-инсталляций рекомендуется использовать внешнее хранилище секретов вместо env-переменных.

### Конфигурация

```env
SECRETS_PROVIDER=IndeedPamAapm
SECRETS_INDEEDPAMAAPM_BASEURL=https://pam.company.local
SECRETS_INDEEDPAMAAPM_APPLICATIONTOKEN=app-token
# или
SECRETS_INDEEDPAMAAPM_APPLICATIONUSERNAME=app-user
SECRETS_INDEEDPAMAAPM_APPLICATIONPASSWORD=app-pass
SECRETS_INDEEDPAMAAPM_DEFAULTACCOUNTPATH=default/path
```

### Формат ссылок

В значениях env-переменных можно использовать PAM-ссылки:

```env
ZABBIX_PASSWORD=secret://Zabbix.ProdPass
CMDBUILD_PASSWORD=aapm://CMDBuild/ProdPass
```

При старте приложения `SecretResolverService` автоматически резолвит ссылки через Indeed PAM AAPM API.

### Legacy env vars (совместимость с ad2cmdb)

Поддерживаются legacy переменные из ad2cmdb:

```env
PAMURL=https://pam.company.local
PAMTOKEN=app-token
PAMUSERNAME=app-user
PAMPASSWORD=app-pass
PAMDEFAULTACCOUNTPATH=default/path
```

Если любая из `PAM*` переменных установлена, `SECRETS_PROVIDER` автоматически устанавливается в `IndeedPamAapm`.
