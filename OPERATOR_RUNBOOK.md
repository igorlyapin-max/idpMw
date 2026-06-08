# Operator Runbook: idmMw

Руководство по эксплуатации middleware для Avanpost IDM 7.8.

## Содержание

1. [Проверка здоровья](#проверка-здоровья)
2. [Security: TLS и шифрование](#security-tls-и-шифрование)
3. [Admin UI auth](#admin-ui-auth)
4. [DLQ: диагностика и ротация](#dlq-диагностика-и-ротация)
5. [Ручной retry](#ручной-retry)
6. [Мониторинг и алерты](#мониторинг-и-алерты)
7. [Инциденты](#инциденты)

## Проверка здоровья

### Быстрая проверка

```bash
# Health endpoint
curl -s http://localhost:3010/health | jq .
# Ожидаемый ответ: {"status":"ok","info":{"database":{"status":"up"}}}

# Prometheus метрики
curl -s http://localhost:3010/metrics | grep "idmmw_"

# Swagger / API docs
curl -s http://localhost:3010/api-json | head -c 200
```

### Компоненты

| Компонент  | Проверка                                       | Критичность                                |
| ---------- | ---------------------------------------------- | ------------------------------------------ |
| PostgreSQL | `pg_isready -U idmmw -d idmmw`                 | Критично                                   |
| Redis      | `/health` показывает `redis.enabled/status`    | Критично при `REDIS_ENABLED=true`          |
| Kafka      | `/health` показывает `kafka.enabled` и brokers | Критично при `IDMMW_PROCESSING_MODE=async` |
| App        | `curl /health`                                 | Критично                                   |

## Security: TLS и шифрование

Полный runbook: [docs/SECURITY_TLS_ENCRYPTION.md](docs/SECURITY_TLS_ENCRYPTION.md).

### Первое включение шифрования

Шифрование можно включать только на пустой системе. Перед запуском остановить
workers и проверить отсутствие данных:

```sql
SELECT COUNT(*) FROM "AuditLog";
SELECT COUNT(*) FROM "DlqItem";
SELECT COUNT(*) FROM "TargetSystem";
SELECT COUNT(*) FROM "IdempotencyKey" WHERE "expiresAt" > now();
```

Настроить keyring:

```env
ENCRYPTION_ENABLED=true
ENCRYPTION_ACTIVE_KEY_ID=key_2026_06
ENCRYPTION_KEYS=key_2026_06
ENCRYPTION_KEY_KEY_2026_06=secret://idmmw-key-2026-06
SECRETS_PROVIDER=IndeedPamAapm
```

После старта проверить:

```sql
SELECT "activeKeyId", "rotationStatus" FROM "EncryptionState";
```

### Замена ключа

1. Добавить новый ключ в keyring, не удаляя старый.
2. Остановить workers или дождаться drain.
3. Проверить DLQ, active idempotency keys и Kafka lag.
4. Запустить:

```bash
npm run security:rotate-key
```

5. Проверить:

```sql
SELECT "activeKeyId", "previousKeyIds", "rotationStatus", "rotatedAt"
FROM "EncryptionState";
```

Старый ключ удалять только после завершения DB rotation, drain Kafka backlog и
истечения Redis/idempotency TTL window.

## Admin UI auth

В production Admin UI должен работать с `ADMIN_AUTH_ENABLED=true`.
Поддерживаются local credentials и SSO через headers от reverse proxy/IdP.

Local режим:

```env
ADMIN_UI_ENABLED=true
ADMIN_AUTH_ENABLED=true
ADMIN_AUTH_MODE=local
ADMIN_AUTH_LOCAL_USERNAME=admin
ADMIN_AUTH_LOCAL_PASSWORD=<strong-password-or-secret-ref>
ADMIN_AUTH_SESSION_SECRET=<long-random-secret>
HTTP_TLS_ENABLED=true
```

SSO режим:

```env
ADMIN_AUTH_ENABLED=true
ADMIN_AUTH_MODE=sso
ADMIN_AUTH_SESSION_SECRET=<long-random-secret>
ADMIN_AUTH_SSO_USER_HEADER=x-authenticated-user
ADMIN_AUTH_SSO_GROUPS_HEADER=x-authenticated-groups
ADMIN_AUTH_ALLOWED_GROUPS=idmmw-admins
```

Проверка:

```bash
curl -s -c /tmp/idmmw.cookies \
  -H "Content-Type: application/json" \
  -X POST http://localhost:3010/auth/login \
  -d '{"username":"admin","password":"<password>"}' | jq .
curl -s -b /tmp/idmmw.cookies http://localhost:3010/admin/stats | jq .
```

Если auth включён, все write-запросы к `/admin/*` должны передавать
`X-CSRF-Token` из `/auth/session` или ответа `/auth/login`. `/health`,
`/metrics`, `/webhooks/avanpost` и `/idm/*` не требуют Admin UI session.

## DLQ: диагностика и ротация

### Проверить размер DLQ

```bash
# Через API
curl -s http://localhost:3010/admin/dlq | jq 'length'
curl -s http://localhost:3010/admin/stats | jq '.dlq'

# Через метрики
curl -s http://localhost:3010/metrics | grep idmmw_dlq_size
curl -s http://localhost:3010/metrics | grep idmmw_events_processed_last_5m

# Через БД
docker exec idmmw-postgres psql -U idmmw -d idmmw -c 'SELECT status, COUNT(*) FROM "DlqItem" GROUP BY status;'
```

### Распространённые причины DLQ

| Ошибка                                | Причина                          | Действие                              |
| ------------------------------------- | -------------------------------- | ------------------------------------- |
| `ECONNREFUSED`                        | Целевая система недоступна       | Проверить сеть, поднять сервис, retry |
| `Request failed with status code 404` | Неверный URL в payload           | Исправить конфигурацию, skip          |
| `SQL syntax error`                    | Неверный rawQuery в DB connector | Исправить запрос, skip                |
| `Timeout`                             | Целевая система медленная        | Увеличить timeout, retry              |

### Ротация DLQ

```bash
# 1. Получить список pending
curl -s http://localhost:3010/admin/dlq?status=pending | jq '.[] | {id, eventId, error}'

# 2. Retry одного события
curl -X POST http://localhost:3010/admin/dlq/<id>/retry

# 3. Skip (если ошибка необратима)
curl -X POST http://localhost:3010/admin/dlq/<id>/skip

# 4. Массовый retry pending по одной управляемой системе
curl -X POST http://localhost:3010/admin/dlq/retry \
  -H "Content-Type: application/json" \
  -d '{"targetSystem":"zabbix-prod","status":"pending","limit":25}'
```

### Через Admin UI

Открыть `http://localhost:3010/` → таблица DLQ → фильтр по статусу и
`targetSystem` → `Retry selected`, row-level `Retry` или `Skip`.

Retry параметры управляются на странице `Target Systems` в блоке
`DLQ retry policy`: `maxRetries`, `baseDelayMs`, `maxDelayMs`,
`dlqLeaseSeconds`, `jitter`.

## Ручной retry

### Retry через API

```bash
curl -X POST http://localhost:3010/admin/dlq/<id>/retry
# → {"success":true}
```

При включённом Kafka событие отправляется в topic из `KAFKA_TOPIC_DLQ_RETRY`.
При выключенной Kafka middleware выполняет retry синхронно и помечает DLQ item
`resolved` при успехе. В обоих режимах item получает retry lease (`lockedAt`,
`lockedBy`), чтобы несколько workers не забрали один и тот же DLQ item.

### Retry через SQL

```bash
docker exec idmmw-postgres psql -U idmmw -d idmmw -c '
  UPDATE "DlqItem"
  SET status = '"'"'retrying'"'"', "retryCount" = "retryCount" + 1
  WHERE id = '"'"'<uuid>'"'"';
'
```

### Проверить результат retry

```bash
# Через 5-10 секунд проверить статус
curl -s http://localhost:3010/admin/dlq | jq '.[] | select(.id=="<uuid>") | {id, status, error}'
```

## Мониторинг и алерты

### Ключевые метрики

| Метрика                                         | Порог          | Действие                             |
| ----------------------------------------------- | -------------- | ------------------------------------ |
| `idmmw_dlq_size{status="pending"}`              | > 100          | Проверить коннекторы, массовый retry |
| `idmmw_events_processed_last_5m`                | резкое падение | Проверить входящий поток и workers   |
| `idmmw_connector_errors_total`                  | > 10/мин       | Проверить целевые системы            |
| `idmmw_http_request_duration_seconds` p95       | > 2s           | Проверить нагрузку, БД               |
| `idmmw_events_processed_total{status="failed"}` | > 50% от total | Критический инцидент                 |

### Grafana Dashboards

- **idmMw Dashboard** — операционные метрики (RPS, latency, DLQ, ошибки)
- **PostgreSQL** — стандартный dashboard для БД

### Логи

```bash
# Последние 50 строк
tail -50 /tmp/idmmw.log

# Поиск ошибок
grep "ERROR" /tmp/idmmw.log | tail -20

# Поиск по eventId
grep "mock-1780" /tmp/idmmw.log
```

Diagnostic logging включается без изменения кода:

```bash
DebugLogging__Enabled=true DebugLogging__Level=Basic npm run start:dev
DebugLogging__Enabled=true DebugLogging__Level=Verbose LOG_SINK=file npm run start:dev
npm run test:runtime-smoke
npm run test:ha-live
```

`Basic` пишет безопасные diagnostic события маршрутизации. `Verbose` допускается только временно и маскирует секретные поля. `LOG_SINK=file` используется как второй JSON sink для collector/sidecar; smoke-проверка подтверждает startup, `/health`, `/metrics`, diagnostic events и redaction. `test:ha-live` дополнительно проверяет реальные Redis/Kafka контейнеры стенда.

## Инциденты

### Сценарий 1: Avanpost IDM шлёт дубликаты

**Признак:** `idmmw_events_processed_total{status="success"}` растёт, но `idmmw_dlq_size` = 0, в AuditLog много записей с одинаковым eventId.

**Действие:** Idempotency должен отсекать дубликаты автоматически. Если `REDIS_ENABLED=false`, проверить `IdempotencyKey` в БД. Если `REDIS_ENABLED=true`, проверить ключ `avanpost:<eventId>` в Redis.

### Сценарий 2: Middleware падает mid-request

**Признак:** PostgreSQL transaction обеспечивает атомарность. После перезапуска проверить DLQ на частично обработанные события.

**Действие:**

```bash
# Перезапуск
kill -9 $(pgrep -f "node dist/main")
cd /opt/idmMw && node dist/main &

# Проверка DLQ
curl -s http://localhost:3010/admin/dlq?status=pending | jq 'length'
```

### Сценарий 3: Kafka lag растёт

**Признак:** `kafka-consumer-groups --describe --group $KAFKA_CONSUMER_GROUP_ID` показывает растущий lag.

**Действие:**

1. Проверить consumer логи на ошибки
2. Увеличить количество consumer instances
3. В sync режиме можно временно отключить Kafka (`KAFKA_ENABLED=false`)
4. В async режиме сначала переключить `IDMMW_PROCESSING_MODE=sync`, затем отключать Kafka

### Сценарий 4: Redis недоступен

**Признак:** startup error или `/health` показывает `redis.status=down` при `REDIS_ENABLED=true`.

**Действие:** Проверить доступность Redis, host/port/password/db и сетевой маршрут. При аварийном fallback можно временно перейти на PostgreSQL idempotency store.

```bash
# Проверить fallback
REDIS_ENABLED=false npm run start:dev
```

### Эскалация

| Уровень | Условие                                 | Действие                                              |
| ------- | --------------------------------------- | ----------------------------------------------------- |
| P3      | DLQ < 10, локальные ошибки              | Ручной retry через UI                                 |
| P2      | DLQ > 100, коннектор недоступен > 5 мин | Массовый retry, проверка сети                         |
| P1      | Middleware down, > 50% events failed    | Перезапуск, rollback конфигурации, эскалация в devops |

## Контакты

- Разработка: idmMw dev team
- DevOps: infrastructure team
