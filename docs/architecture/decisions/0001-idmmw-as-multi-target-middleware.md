# ADR-0001: idmMw as multi-target middleware endpoint

Status: Accepted

## Context

Avanpost IDM needs to manage multiple target systems. Creating separate
middleware instances per target system would duplicate IDM configuration,
increase operational drift and complicate audit/idempotency.

## Decision

idmMw exposes one webhook endpoint:

```text
POST /webhooks/avanpost
```

The routing field is `targetSystem`. In multi-target mode it must equal
`TargetSystem.name`. The event identity must include target context:

```text
eventId = business event id + targetSystem
```

## Consequences

Positive:

- Avanpost IDM can use one integration endpoint for many systems.
- Target systems can be added/disabled through Admin UI/API.
- Audit, idempotency, retry, DLQ and metrics stay centralized.

Tradeoffs:

- IDM administrators must keep `targetSystem` values synchronized with idmMw.
- Incorrect `eventId` design can cause cross-target idempotency collision.
- Runtime documentation must be explicit about `payload.data` and
  `payload.params`.
