import { z } from 'zod';

export const dbConnectorConfigSchema = z.object({
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
});

export type DbConnectorConfig = z.infer<typeof dbConnectorConfigSchema>;
