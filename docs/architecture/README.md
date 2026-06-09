# idmMw architecture artifacts

Этот каталог фиксирует архитектурный контракт idmMw: границы системы,
runtime-потоки, deployment профили, безопасность, observability и принятые
решения. Операционные инструкции остаются в соседних документах; этот набор
нужен для разработки, ревью, CI readiness и передачи системы в эксплуатацию.

## Artifact index

| Artifact                                               | Назначение                                                                  |
| ------------------------------------------------------ | --------------------------------------------------------------------------- |
| [system-context.md](system-context.md)                 | C4-like Context view: внешние системы, роли, trust boundaries               |
| [container-view.md](container-view.md)                 | C4-like Container/Component view: NestJS модули, UI, DB, Kafka, connectors  |
| [runtime-flows.md](runtime-flows.md)                   | Sequence views для write/read webhook, async worker, DLQ retry и Admin CRUD |
| [deployment-view.md](deployment-view.md)               | Deployment profiles, HA topology, CI/deploy gates                           |
| [data-and-security-view.md](data-and-security-view.md) | Данные, секреты, encryption, TLS, audit, diagnostic logging                 |
| [decisions/](decisions/)                               | ADR: почему выбраны ключевые архитектурные решения                          |

## Source of truth

Эти артефакты сверены с реализацией:

- `src/app.module.ts` - модульная композиция приложения.
- `src/main.ts` - listener, TLS, Swagger, startup diagnostics.
- `src/inbound/webhooks/*` - Avanpost-compatible webhook contract.
- `src/inbound/idm/idm.controller.ts` - IDM-facing catalog/read facade.
- `src/admin/*` - Admin API для `TargetSystem` и DLQ.
- `src/connectors/*` - connector registry, static connectors и dynamic proxies.
- `src/core/*` - idempotency, retry, processing, DLQ.
- `src/kafka/*` - async worker и status topics.
- `src/config/*`, `src/diagnostics/*`, `src/security/*` - runtime config,
  logging, TLS и encryption.
- `prisma/schema.prisma` - production data model.
- `deploy/` и `.gitlab-ci.yml` - deployment profiles и CI gates.

## Architectural quality gates

Перед изменением архитектуры проверяйте:

- `targetSystem` остается routing key и совпадает с `TargetSystem.name`.
- `eventId` должен быть уникален на бизнес-событие и целевую систему.
- Production debug выключен по умолчанию:
  `DebugLogging__Enabled=false`, `DebugLogging__Level=Basic`.
- Включение `Verbose` допускается только временно и с redaction.
- `stdout`/`stderr` остаются основным structured logging pipeline.
- Дополнительный sink включается конфигурацией (`LOG_SINK=file`) или внешним
  collector/sidecar/syslog/Kafka/ELK маршрутом платформы.
- `ADMIN_AUTH_ENABLED=true`, `HTTP_TLS_ENABLED=true` или trusted TLS
  termination обязательны для production.
- `ENCRYPTION_ENABLED=true` обязательно до хранения connector tokens/secrets в
  `TargetSystem.config`.
- `IDMMW_PROCESSING_MODE=async` допустим только при `KAFKA_ENABLED=true`.

## Related operational docs

- [../IDM_ADMIN_DEPLOYMENT.md](../IDM_ADMIN_DEPLOYMENT.md)
- [../DEPLOYMENT_PROFILES.md](../DEPLOYMENT_PROFILES.md)
- [../SECURITY_TLS_ENCRYPTION.md](../SECURITY_TLS_ENCRYPTION.md)
- [../CUSTOM_CONNECTOR_DEPLOYMENT.md](../CUSTOM_CONNECTOR_DEPLOYMENT.md)
- [../CONNECTOR_TEMPLATE.md](../CONNECTOR_TEMPLATE.md)
