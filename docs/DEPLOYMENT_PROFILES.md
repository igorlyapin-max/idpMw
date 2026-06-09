# Deployment profiles

idmMw ships two operational deployment profiles and one alternative production
DB profile:

- `sqlite-test` - one worker, SQLite, no Kafka/Redis; for CI smoke and
  disposable test stands only.
- `prod-ha-yugabyte` - production HA default; external Kafka and YugabyteDB
  YSQL with Prisma `provider = "postgresql"`.
- `prod-ha-cockroach` - production HA alternative; external Kafka and
  CockroachDB with Prisma `provider = "cockroachdb"`.

## DB choice

Use **YugabyteDB** as the first production HA target unless the platform team
already standardizes on CockroachDB.

Why:

- The main Prisma schema and migrations already use `provider = "postgresql"`.
- YugabyteDB YSQL is consumed through the normal PostgreSQL DSN and keeps the
  same migration flow as PostgreSQL.
- CockroachDB has a dedicated Prisma provider and the repository already keeps
  `prisma/schema.cockroach.prisma`, but rollout needs a separate generate/build
  path and separate schema validation.

CockroachDB remains supported as a compatibility profile, not the default.

## sqlite-test

Profile files:

- `deploy/profiles/sqlite-test.env.example`
- `deploy/docker-compose.sqlite-test.yml`

Runtime contract:

```env
DATABASE_PROVIDER=sqlite
DATABASE_URL=file:/app/data/idmmw.db
LIGHTWEIGHT_MODE=true
IDMMW_PROCESSING_MODE=sync
KAFKA_ENABLED=false
REDIS_ENABLED=false
DebugLogging__Enabled=true
DebugLogging__Level=Verbose
LOG_SINK=file
```

Run locally:

```bash
docker compose -f deploy/docker-compose.sqlite-test.yml up --build
```

Validate without Docker:

```bash
npm run profile:validate -- sqlite-test
npm run profile:smoke:sqlite
```

This profile intentionally uses `ENCRYPTION_ENABLED=false` and local SQLite.
Do not use it for production connector credentials.

## prod-ha-yugabyte

Profile files:

- `deploy/profiles/prod-ha-yugabyte.env.example`
- `deploy/docker-compose.prod-ha.yml`

Runtime contract:

```env
DATABASE_PROVIDER=postgresql
DATABASE_FLAVOR=yugabytedb
DATABASE_URL=postgresql://...
LIGHTWEIGHT_MODE=false
IDMMW_PROCESSING_MODE=async
KAFKA_ENABLED=true
REDIS_ENABLED=false
ENCRYPTION_ENABLED=true
ADMIN_AUTH_ENABLED=true
HTTP_TLS_ENABLED=true
```

Build image:

```bash
docker build \
  --build-arg PRISMA_SCHEMA=prisma/schema.prisma \
  -t idmmw:prod-ha-yugabyte .
```

Run one instance with compose template:

```bash
cp deploy/profiles/prod-ha-yugabyte.env.example deploy/profiles/prod-ha.env
# edit deploy/profiles/prod-ha.env and replace every REPLACE_* value

IDMMW_IMAGE=idmmw:prod-ha-yugabyte \
IDMMW_ENV_FILE=./profiles/prod-ha.env \
PRISMA_SCHEMA=prisma/schema.prisma \
docker compose -f deploy/docker-compose.prod-ha.yml up -d --build
```

For multiple workers, run the same image and env behind an external reverse
proxy/orchestrator. The compose template only exposes port `3010` inside the
compose network to avoid host-port conflicts during scaling.

## prod-ha-cockroach

Profile files:

- `deploy/profiles/prod-ha-cockroach.env.example`
- `deploy/docker-compose.prod-ha.yml`

Build image with Cockroach Prisma schema:

```bash
docker build \
  --build-arg PRISMA_SCHEMA=prisma/schema.cockroach.prisma \
  -t idmmw:prod-ha-cockroach .
```

Validate without live CockroachDB:

```bash
npm run profile:validate -- prod-ha-cockroach
npm run profile:validate:prod-ha -- cockroach
```

Use this profile only when CockroachDB is the approved platform DB. Keep
Cockroach schema validation in CI before rollout.

## CI jobs

GitLab CI includes profile checks:

- `profile:sqlite-test:smoke`
- `profile:prod-ha:yugabyte:validate`
- `profile:prod-ha:cockroach:validate`

The live HA smoke job is manual and gated by `IDMMW_RUN_LIVE_HA_SMOKE=true`
because it requires reachable Kafka, Redis and container tooling on the runner.

## Security gates

Production profiles must keep:

- `ENCRYPTION_ENABLED=true` before connector tokens are stored in
  `TargetSystem.config`.
- `ADMIN_AUTH_ENABLED=true` for `/admin/*`.
- `HTTP_TLS_ENABLED=true` or equivalent TLS termination at a trusted gateway.
- `DebugLogging__Enabled=false` by default; use `Basic` or `Verbose` only for
  time-bound diagnostics.
- stdout logging always enabled; add a collector/sidecar or file sink according
  to the runtime platform.
