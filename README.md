# idpMw — Middleware для Avanpost IDM 7.8

Промежуточный слой (integration hub) между Avanpost IDM 7.8 и целевыми системами. Обеспечивает идемпотентность, retry с экспоненциальным backoff, DLQ (Dead Letter Queue), audit log и административный UI.

## Стек

- **Backend:** Node.js 20+, NestJS 11+, TypeScript strict
- **Frontend:** React 18, Vite, TypeScript
- **Database:** PostgreSQL 15+ (dev) / CockroachDB или YugabyteDB (prod)
- **ORM:** Prisma
- **Cache/Lock (опц.):** Redis 7+ (Sentinel в prod)
- **Message Bus (опц.):** Apache Kafka 3.x
- **Monitoring:** Prometheus + Grafana
- **Logging:** pino (JSON)

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

| Компонент | Описание |
|-----------|----------|
| Webhook Controller | Приём событий от Avanpost IDM (`POST /webhooks/avanpost`) |
| Idempotency | Предотвращение дубликатов (Redis / PostgreSQL fallback) |
| Retry | Экспоненциальный backoff, max 3 попытки |
| DLQ | Хранение неуспешных событий для ручной обработки |
| Audit | Логирование всех входящих и исходящих вызовов |
| Dispatcher | Маршрутизация событий → коннекторы |
| Connectors | REST, DB (SQL через knex), Zabbix, CMDBuild |
| Kafka (опц.) | Async producer/consumer для масштабирования |
| Admin API | DLQ management, Target Systems management |
| Admin UI | React-приложение для управления DLQ и Target Systems |

### Feature-флаги

Все опциональные компоненты управляются через env-переменные:

```env
REDIS_ENABLED=false          # true для Redis cache/lock
KAFKA_ENABLED=false          # true для async messaging
DB_CONNECTOR_ENABLED=false   # true для SQL-коннектора
ADMIN_UI_ENABLED=true        # true для раздачи React UI
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
DATABASE_URL=file:./data/idpmw.db
```

В lightweight режиме:
- База данных — SQLite (файл `data/idpmw.db`)
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
REDIS_ENABLED=false
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

# Mock IDP (только dev/test)
MOCK_IDP_ENABLED=true
```

## API Endpoints

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/health` | Health check (DB, Redis, Kafka) |
| POST | `/webhooks/avanpost` | Приём событий от Avanpost IDM |
| GET | `/admin/dlq` | Список DLQ (фильтры, пагинация) |
| POST | `/admin/dlq/:id/retry` | Повторная обработка |
| POST | `/admin/dlq/:id/skip` | Пропустить событие |
| GET | `/metrics` | Prometheus метрики |
| GET | `/api` | Swagger UI |
| GET | `/admin/target-systems` | Список target systems |
| POST | `/admin/target-systems` | Создать target system |
| PATCH | `/admin/target-systems/:id` | Обновить target system |
| DELETE | `/admin/target-systems/:id` | Удалить target system |
| POST | `/admin/target-systems/:id/test` | Проверить связь |

## Mock IDP (dev/test)

Модуль для тестирования без реального Avanpost IDM:

```bash
POST /mock-idp/scenario/create-user   # Создание пользователя
POST /mock-idp/scenario/update-user   # Обновление
POST /mock-idp/scenario/delete-user   # Удаление
POST /mock-idp/scenario/duplicate     # Дубликат (проверка idempotency)
POST /mock-idp/scenario/malformed     # Невалидный payload
POST /mock-idp/scenario/fail          # Ошибка коннектора → DLQ
```

## Тестирование

```bash
# Unit tests
npm run test

# E2E tests
npm run test:e2e

# Нагрузочное тестирование
npx autocannon -c 10 -d 10 -m POST \
  -H "Content-Type: application/json" \
  -b '{"eventId":"load-1","operation":"create","targetSystem":"rest","payload":{"url":"http://localhost:3010/health","data":{}}}' \
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
tail -f /tmp/idpmw.log
```

### DLQ растёт

1. Проверить метрики: `curl http://localhost:3010/metrics | grep dlq_size`
2. Проверить ошибки коннекторов: `grep "connector" /tmp/idpmw.log`
3. Ручной retry через Admin UI или API:
   ```bash
   curl -X POST http://localhost:3010/admin/dlq/<id>/retry
   ```

### Kafka не подключается

- Убедиться, что `KAFKA_ENABLED=true` и `KAFKA_BROKERS` корректны
- При `KAFKA_ENABLED=false` middleware работает синхронно (без потери функциональности)

### Redis недоступен

- При `REDIS_ENABLED=false` используется PostgreSQL advisory locks
- Потеря кэша не критична — данные восстанавливаются из PostgreSQL

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
    "baseUrl": "http://zabbix.local/api",
    "username": "admin",
    "code": "..."
  },
  "enabled": true
}
```

Поддерживаемые типы: `zabbix`, `cmdbuild`, `rest`, `db`.

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
