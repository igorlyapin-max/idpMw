# Operator Runbook: idpMw

Руководство по эксплуатации middleware для Avanpost IDM 7.8.

## Содержание

1. [Проверка здоровья](#проверка-здоровья)
2. [DLQ: диагностика и ротация](#dlq-диагностика-и-ротация)
3. [Ручной retry](#ручной-retry)
4. [Мониторинг и алерты](#мониторинг-и-алерты)
5. [Инциденты](#инциденты)

## Проверка здоровья

### Быстрая проверка

```bash
# Health endpoint
curl -s http://localhost:3010/health | jq .
# Ожидаемый ответ: {"status":"ok","info":{"database":{"status":"up"}}}

# Prometheus метрики
curl -s http://localhost:3010/metrics | grep "idpmw_"

# Swagger / API docs
curl -s http://localhost:3010/api-json | head -c 200
```

### Компоненты

| Компонент | Проверка | Критичность |
|-----------|----------|-------------|
| PostgreSQL | `pg_isready -U idpmw -d idpmw` | Критично |
| Redis | `redis-cli ping` | Не критично (fallback на PostgreSQL) |
| Kafka | `kafka-topics --list` | Не критично (fallback синхронный) |
| App | `curl /health` | Критично |

## DLQ: диагностика и ротация

### Проверить размер DLQ

```bash
# Через API
curl -s http://localhost:3010/admin/dlq | jq 'length'

# Через метрики
curl -s http://localhost:3010/metrics | grep idpmw_dlq_size

# Через БД
docker exec idpmw-postgres psql -U idpmw -d idpmw -c 'SELECT status, COUNT(*) FROM "DlqItem" GROUP BY status;'
```

### Распространённые причины DLQ

| Ошибка | Причина | Действие |
|--------|---------|----------|
| `ECONNREFUSED` | Целевая система недоступна | Проверить сеть, поднять сервис, retry |
| `Request failed with status code 404` | Неверный URL в payload | Исправить конфигурацию, skip |
| `SQL syntax error` | Неверный rawQuery в DB connector | Исправить запрос, skip |
| `Timeout` | Целевая система медленная | Увеличить timeout, retry |

### Ротация DLQ

```bash
# 1. Получить список pending
curl -s http://localhost:3010/admin/dlq?status=pending | jq '.[] | {id, eventId, error}'

# 2. Retry одного события
curl -X POST http://localhost:3010/admin/dlq/<id>/retry

# 3. Skip (если ошибка необратима)
curl -X POST http://localhost:3010/admin/dlq/<id>/skip

# 4. Массовый retry всех pending (через SQL)
docker exec idpmw-postgres psql -U idpmw -d idpmw -c '
  UPDATE "DlqItem" SET status = '"'"'retrying'"'"' WHERE status = '"'"'pending'"'"';
'
```

### Через Admin UI

Открыть `http://localhost:3010/` → таблица DLQ → фильтр по статусу → Retry / Skip.

## Ручной retry

### Retry через API

```bash
curl -X POST http://localhost:3010/admin/dlq/<id>/retry
# → {"success":true}
```

При включённом Kafka событие отправляется в topic `idm.dlq.retry`.

### Retry через SQL

```bash
docker exec idpmw-postgres psql -U idpmw -d idpmw -c '
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

| Метрика | Порог | Действие |
|---------|-------|----------|
| `idpmw_dlq_size{status="pending"}` | > 100 | Проверить коннекторы, массовый retry |
| `idpmw_connector_errors_total` | > 10/мин | Проверить целевые системы |
| `idpmw_http_request_duration_seconds` p95 | > 2s | Проверить нагрузку, БД |
| `idpmw_events_processed_total{status="failed"}` | > 50% от total | Критический инцидент |

### Grafana Dashboards

- **idpMw Dashboard** — операционные метрики (RPS, latency, DLQ, ошибки)
- **PostgreSQL** — стандартный dashboard для БД

### Логи

```bash
# Последние 50 строк
tail -50 /tmp/idpmw.log

# Поиск ошибок
grep "ERROR" /tmp/idpmw.log | tail -20

# Поиск по eventId
grep "mock-1780" /tmp/idpmw.log
```

## Инциденты

### Сценарий 1: Avanpost IDM шлёт дубликаты

**Признак:** `idpmw_events_processed_total{status="success"}` растёт, но `idpmw_dlq_size` = 0, в AuditLog много записей с одинаковым eventId.

**Действие:** Idempotency должен отсекать дубликаты автоматически. Проверить `IdempotencyKey` в БД.

### Сценарий 2: Middleware падает mid-request

**Признак:** PostgreSQL transaction обеспечивает атомарность. После перезапуска проверить DLQ на частично обработанные события.

**Действие:**
```bash
# Перезапуск
kill -9 $(pgrep -f "node dist/main")
cd /opt/idpMw && node dist/main &

# Проверка DLQ
curl -s http://localhost:3010/admin/dlq?status=pending | jq 'length'
```

### Сценарий 3: Kafka lag растёт

**Признак:** `kafka-consumer-groups --describe --group idpmw-dlq-retry-group` показывает растущий lag.

**Действие:**
1. Проверить consumer логи на ошибки
2. Увеличить количество consumer instances
3. При необходимости — временно отключить Kafka (`KAFKA_ENABLED=false`) и перейти на синхронную обработку

### Сценарий 4: Redis недоступен

**Признак:** `Redis connection refused` в логах.

**Действие:** Middleware автоматически переключается на PostgreSQL advisory locks. Нет потери данных, только деградация производительности.

```bash
# Проверить fallback
REDIS_ENABLED=false npm run start:dev
```

### Эскалация

| Уровень | Условие | Действие |
|---------|---------|----------|
| P3 | DLQ < 10, локальные ошибки | Ручной retry через UI |
| P2 | DLQ > 100, коннектор недоступен > 5 мин | Массовый retry, проверка сети |
| P1 | Middleware down, > 50% events failed | Перезапуск, rollback конфигурации, эскалация в devops |

## Контакты

- Разработка: idpMw dev team
- DevOps: infrastructure team
