import { z } from 'zod';

export const dbConnectorConfigSchema = z.object({
  DB_CONNECTOR_ENABLED: z
    .string()
    .transform((v) => v === 'true')
    .default(false),
  DB_CONNECTOR_URL: z.string().optional(),
  DB_CONNECTOR_DIALECT: z.enum(['pg', 'mysql2', 'sqlite3']).optional(),
});

export type DbConnectorConfig = z.infer<typeof dbConnectorConfigSchema>;
