import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { Client } from 'pg';
import { AppConfig } from '../config/app-config.service.js';

export type IsolationLevel = 'READ COMMITTED' | 'REPEATABLE READ' | 'SERIALIZABLE';

export interface TransactionOptions {
  /**
   * REPEATABLE READ is the default for money movement: it prevents non-repeatable
   * reads without the retry pressure of SERIALIZABLE. Jobs that must not see a
   * changing snapshot (reconciliation) use SERIALIZABLE and retry.
   */
  readonly isolation?: IsolationLevel;
  /** How many times a serialization failure / deadlock is retried. */
  readonly retries?: number;
  /** Shows up in pg_stat_activity, so a lock wait can be traced to a use case. */
  readonly label?: string;
}

export type NotificationHandler = (payload: string) => void;

/**
 * Postgres error codes worth retrying. 40001 is a serialization failure, 40P01 a
 * deadlock, 40003 an indeterminate commit whose transaction definitely did not
 * apply. Anything else is a bug, not contention.
 */
const RETRYABLE_PG_CODES = new Set(['40001', '40P01', '40003']);

const BASE_RETRY_DELAY_MS = 20;
const MAX_RETRY_DELAY_MS = 500;

function isRetryable(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return typeof code === 'string' && RETRYABLE_PG_CODES.has(code);
}

function backoffMs(attempt: number): number {
  const exponential = BASE_RETRY_DELAY_MS * 2 ** attempt;
  const capped = Math.min(exponential, MAX_RETRY_DELAY_MS);
  // Jitter stops two competing transactions from retrying in lockstep forever.
  return Math.round(capped * (0.5 + Math.random() * 0.5));
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Direct `pg` access for the parts of the system where the SQL *is* the design:
 * the posting engine, the reconciliation proof, and the `LISTEN/NOTIFY` bridge
 * that feeds real-time events to SSE clients.
 *
 * Two connection paths on purpose:
 *   * the request pool talks to the pooled (pgbouncer) endpoint;
 *   * the listener holds one long-lived connection to the DIRECT endpoint, because
 *     `LISTEN` cannot survive transaction-level connection multiplexing.
 */
@Injectable()
export class PgService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PgService.name);
  private pool!: Pool;
  private listenerClient: Client | null = null;
  private listenerReconnectTimer: NodeJS.Timeout | null = null;
  private readonly listeners = new Map<string, Set<NotificationHandler>>();
  private shuttingDown = false;

  constructor(private readonly config: AppConfig) {}

  async onModuleInit(): Promise<void> {
    this.pool = new Pool({
      connectionString: this.config.databaseUrlPooled,
      max: this.config.dbPoolMax,
      application_name: 'meridian-api',
      // Neon is serverless: keep idle clients short-lived so they do not hold a
      // compute awake, but allow the ledger's interactive transactions to finish.
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 15_000,
      statement_timeout: this.config.dbStatementTimeoutMs,
    });

    this.pool.on('error', (error) => {
      this.logger.error(`Idle client error: ${error.message}`);
    });

    await this.pool.query('SELECT 1');
    this.logger.log(`Postgres pool ready (max=${this.config.dbPoolMax})`);
  }

  async onModuleDestroy(): Promise<void> {
    this.shuttingDown = true;
    if (this.listenerReconnectTimer) clearTimeout(this.listenerReconnectTimer);
    if (this.listenerClient) {
      await this.listenerClient.end().catch(() => undefined);
    }
    if (this.pool) await this.pool.end().catch(() => undefined);
  }

  // ----------------------------------------------------------- plain queries

  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params: readonly unknown[] = [],
  ): Promise<QueryResult<T>> {
    return this.pool.query<T>(text, params as unknown[]);
  }

  get poolStats(): { total: number; idle: number; waiting: number } {
    return {
      total: this.pool?.totalCount ?? 0,
      idle: this.pool?.idleCount ?? 0,
      waiting: this.pool?.waitingCount ?? 0,
    };
  }

  // ------------------------------------------------------------- transactions

  /**
   * Run `work` inside a transaction, retrying automatically on serialization
   * failures and deadlocks with jittered exponential backoff.
   *
   * The callback receives the client, so the caller controls isolation-sensitive
   * statements (`SELECT ... FOR UPDATE`) explicitly.
   */
  async transaction<T>(
    work: (client: PoolClient) => Promise<T>,
    options: TransactionOptions = {},
  ): Promise<T> {
    const isolation = options.isolation ?? 'REPEATABLE READ';
    const maxRetries = options.retries ?? 3;
    let attempt = 0;

    for (;;) {
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        // SET TRANSACTION must be the first statement after BEGIN.
        await client.query(`SET TRANSACTION ISOLATION LEVEL ${isolation}`);
        if (options.label) {
          await client.query('SELECT set_config($1, $2, true)', ['meridian.op', options.label]);
        }

        const result = await work(client);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);

        if (isRetryable(error) && attempt < maxRetries) {
          const delay = backoffMs(attempt);
          attempt += 1;
          this.logger.warn(
            `Transaction retry ${attempt}/${maxRetries} after ${(error as { code?: string }).code} ` +
              `(${options.label ?? 'unlabelled'}) in ${delay}ms`,
          );
          await sleep(delay);
          continue;
        }
        throw error;
      } finally {
        client.release();
      }
    }
  }

  /**
   * Transaction-scoped advisory lock. Schedulers use this so that only one API
   * instance runs a given job, and a crashed instance releases the lock
   * automatically when its transaction ends.
   */
  async withAdvisoryLock<T>(
    lockKey: bigint,
    work: (client: PoolClient) => Promise<T>,
    options: TransactionOptions = {},
  ): Promise<T | null> {
    return this.transaction(async (client) => {
      const { rows } = await client.query<{ locked: boolean }>(
        'SELECT pg_try_advisory_xact_lock($1) AS locked',
        [lockKey.toString()],
      );
      if (!rows[0]?.locked) return null;
      return work(client);
    }, options);
  }

  // ------------------------------------------------------------ notifications

  /**
   * Subscribe to a Postgres channel on a dedicated direct connection.
   * Returns an unsubscribe function.
   */
  async listen(channel: string, handler: NotificationHandler): Promise<() => void> {
    const handlers = this.listeners.get(channel) ?? new Set<NotificationHandler>();
    handlers.add(handler);
    const isFirstHandler = handlers.size === 1;
    this.listeners.set(channel, handlers);
    if (isFirstHandler) await this.ensureListening();

    return () => {
      const current = this.listeners.get(channel);
      if (!current) return;
      current.delete(handler);
      if (current.size === 0) this.listeners.delete(channel);
    };
  }

  private async ensureListening(): Promise<void> {
    if (this.listenerClient || this.shuttingDown) return;

    // The direct endpoint, not the pooler: LISTEN needs a connection that is not
    // multiplexed across transactions.
    const client = new Client({
      connectionString: this.config.databaseUrl,
      application_name: 'meridian-api-listener',
      keepAlive: true,
    });

    client.on('notification', (message) => {
      if (!message.channel || message.payload === undefined) return;
      const handlers = this.listeners.get(message.channel);
      if (!handlers) return;
      for (const handler of handlers) {
        try {
          handler(message.payload);
        } catch (error) {
          this.logger.error(`Notification handler failed: ${(error as Error).message}`);
        }
      }
    });

    client.on('error', (error) => {
      this.logger.error(`Listener connection error: ${error.message}`);
      this.scheduleListenerReconnect();
    });

    client.on('end', () => {
      if (!this.shuttingDown) this.scheduleListenerReconnect();
    });

    await client.connect();
    for (const channel of this.listeners.keys()) {
      await client.query(`LISTEN ${quoteIdentifier(channel)}`);
    }
    this.listenerClient = client;
    this.logger.log(`Listening on ${[...this.listeners.keys()].join(', ')} (direct connection)`);
  }

  private scheduleListenerReconnect(): void {
    if (this.shuttingDown || this.listenerReconnectTimer) return;
    this.listenerClient = null;
    this.listenerReconnectTimer = setTimeout(() => {
      this.listenerReconnectTimer = null;
      void this.ensureListening().catch((error: Error) => {
        this.logger.error(`Listener reconnect failed: ${error.message}`);
        this.scheduleListenerReconnect();
      });
    }, 1000) as unknown as NodeJS.Timeout;
  }

  /** Publish on a channel. Safe inside a transaction: `NOTIFY` is delivered on commit. */
  async notify(channel: string, payload: string): Promise<void> {
    await this.query('SELECT pg_notify($1, $2)', [channel, payload]);
  }
}

/** Channel names come from config, but never interpolate them unquoted. */
function quoteIdentifier(identifier: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) {
    throw new Error(`Unsafe SQL identifier: ${identifier}`);
  }
  return `"${identifier}"`;
}
