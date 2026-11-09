import { z } from 'zod';

/**
 * Environment contract. The process refuses to boot with an invalid environment:
 * a bank app that starts with a missing JWT secret or a bad database URL is a
 * security incident waiting to happen.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  API_PREFIX: z.string().default('api'),
  WEB_ORIGIN: z.string().default('http://localhost:5173'),

  // Money / locale
  DEFAULT_CURRENCY: z.string().length(3).default('NGN'),
  DEFAULT_LOCALE: z.string().default('en-NG'),
  BANK_TIMEZONE: z.string().default('Africa/Lagos'),

  // Database
  DATABASE_URL: z.string().url().startsWith('postgres'),
  DATABASE_URL_POOLED: z.string().url().startsWith('postgres'),
  DATABASE_URL_TEST: z.string().url().startsWith('postgres').optional(),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  DB_STATEMENT_TIMEOUT_MS: z.coerce.number().int().min(0).default(15_000),

  // Cache / realtime fan-out
  REDIS_URL: z.string().url().default('redis://localhost:6380'),

  // Auth
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  ARGON2_MEMORY_KIB: z.coerce.number().int().min(8).default(19_456),
  ARGON2_TIME_COST: z.coerce.number().int().min(1).default(2),
  ARGON2_PARALLELISM: z.coerce.number().int().min(1).default(1),
  /** Key for the BVN de-duplication HMAC. The BVN itself is never stored. */
  BVN_HASH_KEY: z.string().min(16).default('meridian-development-bvn-hash-key'),
  MFA_ISSUER: z.string().default('Meridian Bank'),
  STEP_UP_THRESHOLD_MINOR: z.coerce.bigint().default(5_000_000n),

  // Real time
  REALTIME_ENABLED: z.coerce.boolean().default(true),
  SSE_HEARTBEAT_MS: z.coerce.number().int().min(1000).default(15_000),
  SSE_REPLAY_LIMIT: z.coerce.number().int().min(1).max(5000).default(200),
  REALTIME_CHANNEL: z.string().default('meridian:realtime'),

  // Limits / risk (minor units)
  LIMIT_PER_TRANSACTION_MINOR: z.coerce.bigint().default(100_000_000n),
  LIMIT_DAILY_MINOR: z.coerce.bigint().default(500_000_000n),
  LIMIT_MONTHLY_MINOR: z.coerce.bigint().default(5_000_000_000n),
  RISK_ANOMALY_ZSCORE_THRESHOLD: z.coerce.number().min(0).default(3),
  RISK_MIN_HISTORY_FOR_ANOMALY: z.coerce.number().int().min(1).default(10),

  // Jobs
  ENABLE_SCHEDULERS: z.coerce.boolean().default(true),
  OUTBOX_POLL_INTERVAL_MS: z.coerce.number().int().min(50).default(500),
  OUTBOX_BATCH_SIZE: z.coerce.number().int().min(1).max(1000).default(50),
  SETTLEMENT_INTERVAL_MS: z.coerce.number().int().min(500).default(5000),

  // Mail
  SMTP_URL: z.string().default('smtp://localhost:1026'),
  MAIL_FROM: z.string().default('no-reply@meridian.ng'),

  // Observability
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  OTEL_ENABLED: z.coerce.boolean().default(false),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().default('http://localhost:4318'),
  METRICS_ENABLED: z.coerce.boolean().default(true),
});

export type Env = z.infer<typeof envSchema>;

/** Nest `validate` hook: turns a bad environment into a readable startup failure. */
export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}
