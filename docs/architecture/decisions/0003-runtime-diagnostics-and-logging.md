# ADR-0003: Runtime diagnostics and multi-sink logging contract

Status: Accepted

## Context

idmMw operates as integration middleware. Production incidents often require
request routing, target-system and connector diagnostics without changing code
or rebuilding images. At the same time, connector payloads may contain secrets
and identity data.

## Decision

Diagnostic logging is a runtime contract:

- `DebugLogging__Enabled` / `DEBUG_LOGGING_ENABLED` turn diagnostics on.
- `DebugLogging__Level` / `DEBUG_LOGGING_LEVEL` support `Basic` and `Verbose`.
- Production default is disabled.
- `Basic` is safe routing/startup diagnostics.
- `Verbose` may include payload structures but must pass redaction.
- All diagnostics use the main structured logging pipeline.
- stdout/stderr always remain enabled.
- `LOG_SINK=file` can add a second JSON log sink for local/stand deployment;
  production can use platform collector/sidecar/syslog/ELK/Kafka routes.

## Consequences

Positive:

- Debug mode can be enabled without code changes.
- Runtime smoke tests can verify diagnostics, redaction and second sink.
- Logs remain compatible with operational collectors.

Tradeoffs:

- Verbose mode must be time-bound operationally.
- Redaction patterns must be maintained as new connector secret fields appear.
- File sink is not a replacement for production log shipping.
