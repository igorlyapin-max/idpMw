import { z } from 'zod';

export const appConfigSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'production', 'test'])
      .default('development'),
    PORT: z.string().transform(Number).default(3010),
    DATABASE_URL: z.string().min(1),
    DATABASE_PROVIDER: z.enum(['postgresql', 'sqlite']).default('postgresql'),
    LIGHTWEIGHT_MODE: z
      .string()
      .transform((v) => v === 'true')
      .default(false),

    REDIS_ENABLED: z
      .string()
      .transform((v) => v === 'true')
      .default(false),
    REDIS_HOST: z.string().optional(),
    REDIS_PORT: z.string().transform(Number).optional(),

    KAFKA_ENABLED: z
      .string()
      .transform((v) => v === 'true')
      .default(false),
    KAFKA_BROKERS: z.string().optional(),

    DB_CONNECTOR_ENABLED: z
      .string()
      .transform((v) => v === 'true')
      .default(false),
    DB_CONNECTOR_URL: z.string().optional(),
    DB_CONNECTOR_DIALECT: z.enum(['pg', 'mysql2', 'sqlite3']).optional(),

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

    SECRETS_PROVIDER: z.enum(['None', 'IndeedPamAapm']).default('None'),

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
  .passthrough();

export type AppConfig = z.infer<typeof appConfigSchema>;
