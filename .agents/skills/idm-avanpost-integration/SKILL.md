---
name: idm-avanpost-integration
description: >
  Интеграция с Avanpost IDM 7.8: коннекторы, middleware, HA, сетевая архитектура,
  persistence, мониторинг. Enterprise-справочник для разработки Integration Hub.
---

# idm-avanpost-integration

## 1. Продукт и архитектура

Avanpost IDM 7.8 — российское IGA/IDM-решение с микросервисной архитектурой (.NET 6+, PostgreSQL, BPMN).

**Что важно для интеграции:**
- SDK для разработки коннекторов (раздел 10.1 документации) — C#.
- Удалённый сервис коннекторов может работать отдельно от ядра, включая обратный режим (reverse connection) для DMZ.
- Бизнес-процессы BPMN: синхронный и асинхронный вызов сервисов.
- Встроенный аудит — все операции фиксируются в журнале аудита.

---

## 2. Типы коннекторов

| Тип | Описание | Когда использовать |
|-----|----------|------------------|
| **Готовые** | AD, LDAP, 1С, SAP, Exchange, GitLab, PostgreSQL, FreeIPA и др. (50+) | Если система из списка |
| **Универсальные** | SCIM 2.0, SOAP, REST, SAML | Если система предоставляет стандартный API |
| **Кастомные** | Разработка через SDK на C# | Если нужна специфическая логика |

**Правило выбора:**
- Система из списка → готовый коннектор.
- Портал поддерживает SCIM → SCIM-коннектор напрямую (middleware не нужен).
- Портал НЕ поддерживает SCIM → REST/SOAP → middleware.

---

## 3. Модели взаимодействия: Push / Pull / Event-Driven

| Модель | Кто инициирует | Задержка | Когда использовать |
|--------|---------------|----------|-------------------|
| **Pull** | IDM опрашивает по расписанию | 1–60 мин | Кадровые системы (1С, SAP HR) — они редко поддерживают push |
| **Push** | IDM немедленно отправляет изменение | Секунды–минуты | Блокировка доступа (увольнение), создание УЗ. Критично для безопасности |
| **Event-Driven** | Система сообщает IDM о событии | Near real-time | Портал сообщает «я создал пользователя» (теневые админы) |

**Большинство встроенных коннекторов (AD, LDAP, 1С, СУБД) работают в pull-режиме.**

**Критический вывод:** Для увольнений pull с периодом 1 час — неприемлем. Push с задержкой < 30 секунд.

---

## 4. Middleware (Integration Hub)

### Зачем нужен

Avanpost IDM — это оркестратор процессов, а не message broker. Он не берёт на себя:
- Гарантии доставки (at-least-once / exactly-once)
- Идемпотентность при retry
- Асинхронную доставку в Kafka
- Единый audit во внешней системе
- Circuit breaker между порталами

Middleware решает эти проблемы.

### Архитектура middleware (компоненты)

```
REST API Controller (Avanpost вызывает)
    ↓
Request Validator (schema, idempotency)
    ↓
Retry Engine (Polly / Resilience4j)
    ↓
Event Bus → Kafka Producer / HTTP Client / Audit Logger
```

**Ключевые компоненты:**
- **Idempotency Key** — проверка в Redis/PostgreSQL (`Idempotency-Key: <guid>`).
- **Retry state** — хранится в PostgreSQL, не в памяти (иначе при kill pod'а потеряется).
- **DLQ** — после N попыток статус `dlq` + алерт.
- **Audit** — structured JSON в PostgreSQL (или Kafka → ClickHouse/ELK).

---

## 5. Конечная архитектура (рекомендуемая)

### Компоненты

| Компонент | Конфигурация | Обязательность |
|-----------|-------------|----------------|
| **Middleware** | 2+ инстанса, stateless, .NET 8 / Node.js | Обязательно |
| **LB перед middleware** | 2 ноды nginx / Traefik (VRRP/keepalived) | Обязательно |
| **Distributed SQL** | CockroachDB ИЛИ YugabyteDB, 3 ноды (на выбор заказчика) | Обязательно |
| **Redis** | Sentinel, 3 ноды | Рекомендуется |
| **Kafka** | 3 брокера, replication factor 3 | По необходимости |
| **Мониторинг** | Prometheus + Grafana + Loki | Рекомендуется |

### Почему Distributed SQL (3 ноды)

- Native HA через Raft — нет мастер/реплика, автоматический failover.
- PostgreSQL-wire compatible — Npgsql без изменений.
- 3 ноды — минимум для quorum (выдерживаем падение 1 ноды).
- 2 ноды — невозможно (split-brain).

```csharp
var connString = "Host=db-1:26257,db-2:26257,db-3:26257;" +
                 "Database=middleware;Username=app;SSL Mode=Require";
```

### Зачем Redis и нужен ли он в 3 нодах?

| Задача | Без Redis (PostgreSQL only) | С Redis |
|--------|----------------------------|---------|
| **Distributed lock** | `pg_advisory_lock` — работает, но блокирует БД | `RedLock` — O(1), не нагружает PostgreSQL |
| **Idempotency check** | `SELECT` по индексу — ~2–5 мс | `GET` — ~0.1 мс |
| **Rate limiting** | `UPDATE` счётчика в БД — нагрузка | `INCR` + `EXPIRE` — O(1) |

**Redis — это оптимизация, а не блокер.** Без него middleware работает, но медленнее.

**Когда НЕ нужен:**
- 1 инстанс middleware (dev / пилот) — нет конкуренции за jobs.
- Низкая нагрузка (< 10 RPS) — PostgreSQL справится.

**Когда нужен:**
- 2+ инстанса middleware + background workers.
- Нагрузка > 100 RPS.

**Почему 3 ноды (Sentinel):**
- Sentinel требует quorum для failover.
- 2 ноды — split-brain. 1 нода — single point of failure.

**Можно ли упростить?**
| Вариант | Когда |
|---------|-------|
| Без Redis | Dev / пилот / низкая нагрузка |
| 1 нода Redis, без Sentinel | Test (потеря кэша не критична, восстанавливается из PostgreSQL) |
| 3 ноды Sentinel | Prod, если 2+ инстанса middleware и нагрузка > 50 RPS |

### Нужен ли Kafka?

**Обязательно, если** порталы event-driven (читают события из Kafka) или нужен audit stream для BI.

**Не нужен, если** порталы REST-only. Middleware делает sync HTTP-вызов к порталу, retry через PostgreSQL.

### Retry в HA

Таблица `provisioning_jobs` + background workers с `FOR UPDATE SKIP LOCKED`.

### Deployment

| Среда | Инфраструктура | Инстансы middleware |
|-------|---------------|---------------------|
| Dev | Docker Compose | 1 |
| Test | Docker Compose + nginx | 2 |
| Prod | Kubernetes | 3 |

---

## 6. Сетевая архитектура

### Кто к кому ходит

```
Avanpost IDM ──(HTTPS)──> LB-middleware ──┬──> middleware-1
                                            └──> middleware-2

middleware ──(HTTPS)──> LB-portal ──┬──> portal-app-1
                                    └──> portal-app-2

middleware ──(Kafka Producer)──> Kafka ──> portal-consumers
```

### Ключевые правила

- **Avanpost IDM не умеет service discovery.** В REST-коннекторе указывается **один URL** — это должен быть балансировщик.
- **Middleware stateless** — любой запрос может быть обработан на любом инстансе.
- **Round-robin DNS — плохая замена LB.** DNS не делает health-check, не гарантирует равномерное распределение, кэшируется клиентом.

### Можно ли сократить количество LB?

| Схема | Описание | Когда |
|-------|----------|-------|
| **Общие LB** | 2 ноды nginx обслуживают и middleware, и порталы | Test, экономия ресурсов |
| **Раздельные LB** | nginx-idm (DMZ) + nginx-portal (internal) | Prod VM, изоляция безопасности |
| **K8s Ingress** | Один Ingress Controller (2+ реплики) на кластер | Prod K8s, стандартная практика |

---

## 7. Мониторинг vs UI

### Без собственного UI (начало)

| Задача | Инструмент |
|--------|-----------|
| DLQ + retry | Kafka UI / AKHQ, SQL UPDATE |
| Audit log | Grafana + PostgreSQL data source |
| Статус порталов | Grafana dashboard |
| Конфигурация | Env vars + redeploy |

### Минимальный UI для DLQ (если нужен)

**Функционал:**
- Таблица заявок в DLQ с фильтрами (портал, операция, дата).
- Кнопка «Retry» — меняет status на `pending`.
- Кнопка «Skip» — меняет status на `skipped`.
- Экспорт в CSV.

**Технологии:**
- Frontend: React / Vue на статике (nginx отдаёт `index.html`).
- API: Те же endpoint middleware, route `/admin/*`.
- Auth: API Key / JWT с ролью `admin`.
- Данные: прямое чтение PostgreSQL (read-only).

**Трудозатраты:** 1 неделя (backend 4 часа + frontend 2 дня).

**Когда делать:**
| Условие | Решение |
|---------|---------|
| < 10 DLQ/неделю, команда разработки | Без UI |
| 10–100 DLQ/неделю | Минимальный UI |
| > 100 DLQ/неделю или Helpdesk | Полноценный UI |

---

## 8. Guardrails

- Никогда не хардкодьте dev-credentials в тестах — используйте `WebApplicationFactory` + `TestContainers`.
- Тестовые данные должны воспроизводиться из seeds.
- Middleware должен быть идемпотентным — один и тот же `Idempotency-Key` не должен создавать дубль.
- Не делайте middleware stateful в памяти — всё состояние в PostgreSQL.
- Graceful shutdown: дождитесь текущих запросов (30 сек) перед kill.

---

## 10. Реализованный проект: idpMw

Репозиторий: `~/projects/idpMw` — готовый middleware на NestJS + React.

### Стек реализации

| Компонент | Технология |
|-----------|-----------|
| Backend | Node.js 20, NestJS 10, TypeScript strict |
| Frontend | React 18, Vite, TypeScript |
| ORM | Prisma 5 |
| SQL Connector | knex (pg, mysql2, sqlite3) |
| Kafka | kafkajs (conditional module) |
| Metrics | @willsoto/nestjs-prometheus + prom-client |
| Logging | nestjs-pino |

### API Endpoints

| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/webhooks/avanpost` | Приём событий от Avanpost IDM |
| GET | `/health` | Health check (DB, Redis, Kafka) |
| GET | `/admin/dlq` | Список DLQ |
| POST | `/admin/dlq/:id/retry` | Retry события |
| POST | `/admin/dlq/:id/skip` | Skip события |
| GET | `/metrics` | Prometheus метрики |
| GET | `/api` | Swagger UI |

### Feature-флаги (env)

```env
REDIS_ENABLED=false          # PostgreSQL fallback для idempotency
KAFKA_ENABLED=false          # Синхронная обработка fallback
DB_CONNECTOR_ENABLED=false   # SQL-коннектор через knex
ADMIN_UI_ENABLED=true        # Раздача React UI
```

### Mock IDP (dev/test)

Встроенный эмулятор Avanpost IDM без реального IDP:
- `/mock-idp/scenario/create-user` — создание пользователя
- `/mock-idp/scenario/update-user` — обновление
- `/mock-idp/scenario/delete-user` — удаление
- `/mock-idp/scenario/duplicate` — проверка idempotency
- `/mock-idp/scenario/malformed` — невалидный payload
- `/mock-idp/scenario/fail` — эмуляция ошибки коннектора → DLQ

### Мониторинг

- Prometheus metrics: `idpmw_http_requests_total`, `idpmw_http_request_duration_seconds`, `idpmw_connector_errors_total`, `idpmw_dlq_size`, `idpmw_events_processed_total`
- Grafana dashboard: `monitoring/grafana/dashboards/idpmw-dashboard.json`
- Docker Compose: `docker-compose.monitoring.yml` (Prometheus + Grafana)

### Тесты

```bash
npm run test       # Unit (7 тестов)
npm run test:e2e   # E2E (3 теста)
npm run validate   # tsc + prisma validate + lint
```

### Документация в репозитории

- `README.md` — dev/prod setup, env vars, troubleshooting
- `OPERATOR_RUNBOOK.md` — DLQ ротация, retry, инциденты, эскалация

---

## 9. Источники

- Документация Avanpost IDM 7.8: https://docs.avanpost.ru/idm/7.8/index.html
- Раздел 10.1 «Разработка коннекторов»
- Раздел 5.4 «Удаленный сервис коннекторов»
- Раздел 6.1.5 «Брокеры сообщений»
- Раздел 6.1.4 «Интеграция с целевыми системами»
- PartnersDocs (совместимость): https://docs.avanpost.ru/partners/1.0/172986397.html
