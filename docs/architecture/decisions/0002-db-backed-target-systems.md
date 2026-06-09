# ADR-0002: DB-backed TargetSystem dynamic connector proxies

Status: Accepted

## Context

Static connector classes know how to talk to a system type, for example
`zabbix`, `cmdbuild` or `passwork`. They should not be hardcoded to one
environment-specific endpoint or one credential set.

## Decision

Store runtime target instances in `TargetSystem`:

- `name` - IDM routing key;
- `type` - static connector blueprint name;
- `label` - operator-facing name;
- `config` - endpoint, credentials, TLS and retryPolicy;
- `enabled` - registry visibility.

`ConnectorRegistry.reload()` creates a dynamic proxy for every enabled row. The
proxy injects `TargetSystem.config` into `payload.config` and delegates to the
static connector implementation.

## Consequences

Positive:

- Per-target changes do not require application restart.
- One connector implementation can serve many target instances.
- Admin UI/API has one generic model for connectors.

Tradeoffs:

- `TargetSystem.config` becomes sensitive storage and must be encrypted in
  production.
- Connector authors must keep IDM data in `payload.data`/`payload.params` and
  never expect IDM to submit `payload.config`.
- Registry reload is currently process-local; clustered deployments rely on
  each worker reloading on its own Admin CRUD path or restart.
