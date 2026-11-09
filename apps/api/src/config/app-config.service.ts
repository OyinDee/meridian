import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CurrencyCode, DEFAULT_CURRENCY, DEFAULT_LOCALE, DEFAULT_TIMEZONE } from '@meridian/money';
import { Env } from './env.validation.js';

/**
 * Typed access to configuration.
 *
 * Everything reads config through this class instead of `process.env`, so a typo
 * is a compile error, defaults exist in exactly one place, and tests can override
 * values through the Nest container.
 */
@Injectable()
export class AppConfig {
  constructor(private readonly config: ConfigService<Env, true>) {}

  private get<K extends keyof Env>(key: K): Env[K] {
    return this.config.get(key, { infer: true });
  }

  get nodeEnv(): Env['NODE_ENV'] {
    return this.get('NODE_ENV');
  }

  get isProduction(): boolean {
    return this.nodeEnv === 'production';
  }

  get isTest(): boolean {
    return this.nodeEnv === 'test';
  }

  get port(): number {
    return this.get('PORT');
  }

  get apiPrefix(): string {
    return this.get('API_PREFIX');
  }

  get webOrigin(): string {
    return this.get('WEB_ORIGIN');
  }

  // ---------------------------------------------------------------- money

  get homeCurrency(): CurrencyCode {
    return (this.config.get('DEFAULT_CURRENCY', { infer: true }) ?? DEFAULT_CURRENCY) as CurrencyCode;
  }

  get locale(): string {
    return this.config.get('DEFAULT_LOCALE', { infer: true }) ?? DEFAULT_LOCALE;
  }

  /** Everything date-window related (daily limits, accrual cut-offs) uses this. */
  get timezone(): string {
    return this.config.get('BANK_TIMEZONE', { infer: true }) ?? DEFAULT_TIMEZONE;
  }

  // ------------------------------------------------------------- database

  /** Direct connection: migrations, LISTEN/NOTIFY, reconciliation. */
  get databaseUrl(): string {
    return this.get('DATABASE_URL');
  }

  /** Pooled (pgbouncer) connection used by request handling. */
  get databaseUrlPooled(): string {
    return this.get('DATABASE_URL_POOLED');
  }

  get databaseUrlTest(): string | undefined {
    return this.config.get('DATABASE_URL_TEST', { infer: true });
  }

  get dbPoolMax(): number {
    return this.get('DB_POOL_MAX');
  }

  get dbStatementTimeoutMs(): number {
    return this.get('DB_STATEMENT_TIMEOUT_MS');
  }

  get redisUrl(): string {
    return this.get('REDIS_URL');
  }

  // ----------------------------------------------------------------- auth

  get jwtAccessSecret(): string {
    return this.get('JWT_ACCESS_SECRET');
  }

  get jwtRefreshSecret(): string {
    return this.get('JWT_REFRESH_SECRET');
  }

  get accessTokenTtl(): string {
    return this.get('ACCESS_TOKEN_TTL');
  }

  get refreshTokenTtlDays(): number {
    return this.get('REFRESH_TOKEN_TTL_DAYS');
  }

  get argon2(): { memoryCost: number; timeCost: number; parallelism: number } {
    return {
      memoryCost: this.get('ARGON2_MEMORY_KIB'),
      timeCost: this.get('ARGON2_TIME_COST'),
      parallelism: this.get('ARGON2_PARALLELISM'),
    };
  }

  get mfaIssuer(): string {
    return this.get('MFA_ISSUER');
  }

  get bvnHashKey(): string {
    return this.get('BVN_HASH_KEY');
  }

  /** Transfers above this amount need a fresh TOTP code, in minor units. */
  get stepUpThresholdMinor(): bigint {
    return this.get('STEP_UP_THRESHOLD_MINOR');
  }

  // ------------------------------------------------------------- realtime

  get realtimeEnabled(): boolean {
    return this.get('REALTIME_ENABLED');
  }

  get sseHeartbeatMs(): number {
    return this.get('SSE_HEARTBEAT_MS');
  }

  get sseReplayLimit(): number {
    return this.get('SSE_REPLAY_LIMIT');
  }

  get realtimeChannel(): string {
    return this.get('REALTIME_CHANNEL');
  }

  // ------------------------------------------------------- limits / risk

  get limits(): {
    perTransactionMinor: bigint;
    dailyMinor: bigint;
    monthlyMinor: bigint;
  } {
    return {
      perTransactionMinor: this.get('LIMIT_PER_TRANSACTION_MINOR'),
      dailyMinor: this.get('LIMIT_DAILY_MINOR'),
      monthlyMinor: this.get('LIMIT_MONTHLY_MINOR'),
    };
  }

  get riskAnomalyZScoreThreshold(): number {
    return this.get('RISK_ANOMALY_ZSCORE_THRESHOLD');
  }

  get riskMinHistoryForAnomaly(): number {
    return this.get('RISK_MIN_HISTORY_FOR_ANOMALY');
  }

  // --------------------------------------------------------------- jobs

  get schedulersEnabled(): boolean {
    return this.get('ENABLE_SCHEDULERS');
  }

  get outboxPollIntervalMs(): number {
    return this.get('OUTBOX_POLL_INTERVAL_MS');
  }

  get outboxBatchSize(): number {
    return this.get('OUTBOX_BATCH_SIZE');
  }

  get settlementIntervalMs(): number {
    return this.get('SETTLEMENT_INTERVAL_MS');
  }

  // --------------------------------------------------------------- mail

  get smtpUrl(): string {
    return this.get('SMTP_URL');
  }

  get mailFrom(): string {
    return this.get('MAIL_FROM');
  }

  // ------------------------------------------------------ observability

  get logLevel(): string {
    return this.get('LOG_LEVEL');
  }

  get otelEnabled(): boolean {
    return this.get('OTEL_ENABLED');
  }

  get otelEndpoint(): string {
    return this.get('OTEL_EXPORTER_OTLP_ENDPOINT');
  }

  get metricsEnabled(): boolean {
    return this.get('METRICS_ENABLED');
  }
}
