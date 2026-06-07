import { z } from 'zod';

export const appConfigSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'production', 'test'])
      .default('development'),
    PORT: z.string().transform(Number).default(3010),
    DATABASE_URL: z.string().min(1),
    DATABASE_PROVIDER: z.enum(['postgresql', 'sqlite']).default('postgresql'),
    DATABASE_FLAVOR: z
      .enum(['postgresql', 'yugabytedb', 'cockroachdb'])
      .default('postgresql'),
    LIGHTWEIGHT_MODE: z
      .string()
      .transform((v) => v === 'true')
      .default(false),

    REDIS_ENABLED: z
      .string()
      .transform((v) => v === 'true')
      .default(false),
    REDIS_HOST: z.string().optional(),
    REDIS_PORT: z.string().transform(Number).default(6379),
    REDIS_PASSWORD: z.string().optional(),
    REDIS_DB: z.string().transform(Number).default(0),
    REDIS_TLS_ENABLED: z
      .string()
      .transform((v) => v === 'true')
      .default(false),
    REDIS_TLS_VERIFY: z.string().optional(),
    REDIS_TLS_REJECT_UNAUTHORIZED: z.string().optional(),
    REDIS_TLS_CA: z.string().optional(),
    REDIS_TLS_CA_PATH: z.string().optional(),
    REDIS_TLS_CERT: z.string().optional(),
    REDIS_TLS_CERT_PATH: z.string().optional(),
    REDIS_TLS_KEY: z.string().optional(),
    REDIS_TLS_KEY_PATH: z.string().optional(),
    REDIS_TLS_SERVER_NAME: z.string().optional(),

    KAFKA_ENABLED: z
      .string()
      .transform((v) => v === 'true')
      .default(false),
    KAFKA_BROKERS: z.string().default('localhost:9092'),
    KAFKA_CLIENT_ID: z.string().default('idmmw'),
    KAFKA_CONSUMER_GROUP_ID: z.string().default('idmmw-worker-group'),
    KAFKA_TOPIC_EVENTS_IN: z.string().default('idm.events.in'),
    KAFKA_TOPIC_EVENTS_OUT: z.string().default('idm.events.out'),
    KAFKA_TOPIC_DLQ_RETRY: z.string().default('idm.dlq.retry'),
    KAFKA_TLS_ENABLED: z
      .string()
      .transform((v) => v === 'true')
      .default(false),
    KAFKA_TLS_VERIFY: z.string().optional(),
    KAFKA_TLS_REJECT_UNAUTHORIZED: z.string().optional(),
    KAFKA_TLS_CA: z.string().optional(),
    KAFKA_TLS_CA_PATH: z.string().optional(),
    KAFKA_TLS_CERT: z.string().optional(),
    KAFKA_TLS_CERT_PATH: z.string().optional(),
    KAFKA_TLS_KEY: z.string().optional(),
    KAFKA_TLS_KEY_PATH: z.string().optional(),
    KAFKA_TLS_SERVER_NAME: z.string().optional(),
    IDMMW_PROCESSING_MODE: z.enum(['sync', 'async']).default('sync'),
    DLQ_RETRY_LEASE_SECONDS: z.string().transform(Number).default(300),

    DB_CONNECTOR_ENABLED: z
      .string()
      .transform((v) => v === 'true')
      .default(false),
    DB_CONNECTOR_URL: z.string().optional(),
    DB_CONNECTOR_DIALECT: z
      .enum(['pg', 'mysql2', 'sqlite3', 'oracledb'])
      .optional(),
    DB_CONNECTOR_USERNAME: z.string().optional(),
    DB_CONNECTOR_PASSWORD: z.string().optional(),
    DB_CONNECTOR_TLS_ENABLED: z
      .string()
      .transform((v) => v === 'true')
      .default(false),
    DB_CONNECTOR_TLS_VERIFY: z.string().optional(),
    DB_CONNECTOR_TLS_REJECT_UNAUTHORIZED: z.string().optional(),
    DB_CONNECTOR_TLS_CA: z.string().optional(),
    DB_CONNECTOR_TLS_CA_PATH: z.string().optional(),
    DB_CONNECTOR_TLS_CERT: z.string().optional(),
    DB_CONNECTOR_TLS_CERT_PATH: z.string().optional(),
    DB_CONNECTOR_TLS_KEY: z.string().optional(),
    DB_CONNECTOR_TLS_KEY_PATH: z.string().optional(),
    DB_CONNECTOR_TLS_SERVER_NAME: z.string().optional(),
    DB_CONNECTOR_TLS_WALLET_LOCATION: z.string().optional(),
    DB_CONNECTOR_TLS_WALLET_PASSWORD: z.string().optional(),

    MOCK_IDM_ENABLED: z
      .string()
      .transform((v) => v === 'true')
      .default(false),
    MOCK_IDM_PORT: z.string().transform(Number).default(5100),

    ADMIN_UI_ENABLED: z
      .string()
      .transform((v) => v === 'true')
      .default(false),
    ADMIN_UI_SERVE_STATIC: z
      .string()
      .transform((v) => v === 'true')
      .default(false),
    HTTP_TLS_ENABLED: z
      .string()
      .transform((v) => v === 'true')
      .default(false),
    HTTP_TLS_VERIFY: z.string().optional(),
    HTTP_TLS_REJECT_UNAUTHORIZED: z.string().optional(),
    HTTP_TLS_CA: z.string().optional(),
    HTTP_TLS_CA_PATH: z.string().optional(),
    HTTP_TLS_CERT: z.string().optional(),
    HTTP_TLS_CERT_PATH: z.string().optional(),
    HTTP_TLS_KEY: z.string().optional(),
    HTTP_TLS_KEY_PATH: z.string().optional(),
    HTTP_TLS_SERVER_NAME: z.string().optional(),
    HTTP_TLS_REQUEST_CLIENT_CERT: z.string().optional(),

    SECRETS_PROVIDER: z.enum(['None', 'IndeedPamAapm']).default('None'),
    ENCRYPTION_ENABLED: z
      .string()
      .transform((v) => v === 'true')
      .default(false),
    ENCRYPTION_KAFKA_ENABLED: z.string().optional(),
    ENCRYPTION_IDEMPOTENCY_HMAC_ENABLED: z.string().optional(),
    ENCRYPTION_ROTATION_MODE: z.string().optional(),
    ENCRYPTION_ROTATION_SKIP_KAFKA_LAG_CHECK: z.string().optional(),
    ENCRYPTION_ACTIVE_KEY_ID: z.string().optional(),
    ENCRYPTION_KEY_ID: z.string().optional(),
    ENCRYPTION_KEYS: z.string().optional(),
    ENCRYPTION_KEY: z.string().optional(),

    DebugLogging__Enabled: z
      .string()
      .transform((v) => v === 'true')
      .default(false),
    DebugLogging__Level: z.enum(['Basic', 'Verbose']).default('Basic'),
    DEBUG_LOGGING_ENABLED: z
      .string()
      .transform((v) => v === 'true')
      .default(false),
    DEBUG_LOGGING_LEVEL: z.enum(['Basic', 'Verbose']).optional(),

    LOG_SINK: z.enum(['stdout', 'file']).default('stdout'),
    LOG_FILE_PATH: z.string().default('/tmp/idmmw.log'),
  })
  .passthrough()
  .superRefine((config, ctx) => {
    if (config.IDMMW_PROCESSING_MODE === 'async' && !config.KAFKA_ENABLED) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['IDMMW_PROCESSING_MODE'],
        message:
          'IDMMW_PROCESSING_MODE=async requires KAFKA_ENABLED=true and reachable Kafka brokers',
      });
    }
  });

export type AppConfig = z.infer<typeof appConfigSchema>;
