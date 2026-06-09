# ADR-0004: Production HA database profiles

Status: Accepted

## Context

Production HA needs a distributed database choice. The repository supports the
main PostgreSQL Prisma schema and an additional CockroachDB Prisma schema.

## Decision

Use `prod-ha-yugabyte` as the default production HA profile. Keep
`prod-ha-cockroach` as a supported alternative.

Rationale:

- The main Prisma schema uses `provider = "postgresql"`.
- YugabyteDB YSQL is consumed through a normal PostgreSQL DSN and keeps the
  main schema/generate path.
- CockroachDB requires `provider = "cockroachdb"` and a separate schema/generate
  path, which is already represented by `prisma/schema.cockroach.prisma`.

## Consequences

Positive:

- Default HA path stays closest to the existing PostgreSQL implementation.
- CockroachDB users still have a validated profile.
- CI validates both schema/build paths.

Tradeoffs:

- Production DB migrations and SQL behavior must be validated against the
  selected distributed database, not only local PostgreSQL.
- CockroachDB deployments must build with the Cockroach Prisma schema.
