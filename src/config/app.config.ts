import { z } from 'zod';

export const appConfigSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  PORT: z.string().transform(Number).default(3000),
  DATABASE_URL: z.string().min(1),

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

  MOCK_IDP_ENABLED: z
    .string()
    .transform((v) => v === 'true')
    .default(false),
  MOCK_IDP_PORT: z.string().transform(Number).default(5100),

  ADMIN_UI_ENABLED: z
    .string()
    .transform((v) => v === 'true')
    .default(false),
  ADMIN_UI_SERVE_STATIC: z
    .string()
    .transform((v) => v === 'true')
    .default(false),
});

export type AppConfig = z.infer<typeof appConfigSchema>;
