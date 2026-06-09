# System context

idmMw - middleware endpoint для Avanpost IDM 7.8. IDM видит одну интеграцию,
а idmMw маршрутизирует события в несколько целевых систем по `targetSystem`.

## Primary responsibilities

- Принимать Avanpost-compatible события на `POST /webhooks/avanpost`.
- Поддерживать каталог и read facade для IDM через `/idm/*`.
- Хранить и применять `TargetSystem` configuration без перезапуска runtime.
- Выполнять write/read операции через connectors: REST, DB, Zabbix, CMDBuild,
  Passwork, fake reference connector.
- Обеспечивать idempotency, retry, DLQ, audit, metrics, diagnostic logging,
  TLS и encryption.

## Context diagram

```mermaid
flowchart LR
  IDM[Avanpost IDM 7.8]
  Admin[IDM/admin operator]
  Ops[Platform/SRE]
  MW[idmMw\nNestJS middleware]
  UI[Admin UI\nReact]
  DB[(PostgreSQL/YugabyteDB/CockroachDB\nor SQLite test)]
  Redis[(Redis optional\nidempotency)]
  Kafka[(Kafka optional\nasync/status/retry topics)]
  Metrics[Prometheus/Grafana]
  Secrets[Indeed PAM/AAPM optional]
  Targets[Target systems\nZabbix, CMDBuild, Passwork,\nREST, DB, custom connectors]

  IDM -->|POST /webhooks/avanpost| MW
  IDM -->|GET/POST /idm/* read/catalog facade| MW
  Admin -->|/admin/* API| MW
  Admin -->|browser| UI
  UI -->|same-origin /admin/* /auth/*| MW
  Ops -->|/health /metrics logs| MW
  MW --> DB
  MW -. optional .-> Redis
  MW -. optional .-> Kafka
  MW --> Metrics
  MW -. optional secret:// .-> Secrets
  MW -->|connector APIs with per-target TLS/retry| Targets
```

## External actors

| Actor              | Responsibility                                                 | Main endpoints                      |
| ------------------ | -------------------------------------------------------------- | ----------------------------------- |
| Avanpost IDM       | Отправляет write events и вызывает read/catalog facade         | `POST /webhooks/avanpost`, `/idm/*` |
| IDM/admin operator | Создает `TargetSystem`, проверяет связь, смотрит DLQ           | `/admin/*`, Admin UI                |
| Platform/SRE       | Настраивает deployment profile, TLS, secrets, logging, metrics | `/health`, `/metrics`, logs         |
| Target systems     | Получают lifecycle operations от idmMw                         | Connector-specific APIs             |

## Trust boundaries

| Boundary                   | Contract                                                                  |
| -------------------------- | ------------------------------------------------------------------------- |
| IDM -> idmMw inbound       | TLS через `HTTP_TLS_*` или trusted gateway; webhook не требует admin auth |
| Admin browser/API -> idmMw | `/admin/*` защищается `ADMIN_AUTH_ENABLED=true` в production              |
| idmMw -> target systems    | Per-target `config.tls`, `retryPolicy`, endpoint credentials              |
| idmMw -> Kafka/Redis/DB    | TLS через `KAFKA_TLS_*`, `REDIS_TLS_*`, DB connection settings            |
| idmMw -> logs/metrics      | Structured logs with redaction; metrics без секретов                      |
