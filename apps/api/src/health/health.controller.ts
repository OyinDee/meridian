import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckResult,
  HealthCheckService,
  HealthIndicatorResult,
  HealthIndicatorService,
} from '@nestjs/terminus';
import { ApiExcludeController } from '@nestjs/swagger';
import { AppConfig } from '../config/app-config.service.js';
import { PgService } from '../database/pg.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** Outbox lag beyond this means real-time events are not being delivered on time. */
const OUTBOX_LAG_WARN_SECONDS = 30;

@ApiExcludeController()
@Controller('health')
export class HealthController {
  private readonly startedAt = Date.now();

  constructor(
    private readonly health: HealthCheckService,
    private readonly indicator: HealthIndicatorService,
    private readonly prisma: PrismaService,
    private readonly pg: PgService,
    private readonly config: AppConfig,
  ) {}

  /** Liveness: the process is up. Never fails on dependencies, so a DB blip does not restart the container. */
  @Get()
  @HealthCheck()
  liveness(): Promise<HealthCheckResult> {
    return this.health.check([
      () =>
        this.indicator.check('process').up({
          uptimeSeconds: Math.round((Date.now() - this.startedAt) / 1000),
          version: process.env.npm_package_version ?? '0.1.0',
          homeCurrency: this.config.homeCurrency,
          timezone: this.config.timezone,
        }),
    ]);
  }

  /** Readiness: dependencies needed to move money. */
  @Get('ready')
  @HealthCheck()
  readiness(): Promise<HealthCheckResult> {
    return this.health.check([
      () => this.checkPrisma(),
      () => this.checkLedgerPool(),
      () => this.checkOutboxLag(),
    ]);
  }

  private async checkPrisma(): Promise<HealthIndicatorResult> {
    const check = this.indicator.check('postgres');
    try {
      await this.prisma.ping();
      return check.up();
    } catch (error) {
      return check.down({ message: (error as Error).message });
    }
  }

  private async checkLedgerPool(): Promise<HealthIndicatorResult> {
    const check = this.indicator.check('postgres_pool');
    try {
      const { rows } = await this.pg.query<{ journals: string; entries: string }>(
        `SELECT
           (SELECT count(*) FROM journal_transactions)::text AS journals,
           (SELECT count(*) FROM ledger_entries)::text AS entries`,
      );
      return check.up({ ...this.pg.poolStats, ...rows[0] });
    } catch (error) {
      return check.down({ message: (error as Error).message });
    }
  }

  private async checkOutboxLag(): Promise<HealthIndicatorResult> {
    const check = this.indicator.check('outbox');
    try {
      const { rows } = await this.pg.query<{ pending: number; lag_seconds: number | null }>(
        `SELECT count(*)::int AS pending,
                EXTRACT(EPOCH FROM (now() - min(created_at)))::float8 AS lag_seconds
           FROM outbox_events
          WHERE processed_at IS NULL`,
      );
      const pending = rows[0]?.pending ?? 0;
      const lagSeconds = rows[0]?.lag_seconds ?? 0;
      const payload = { pending, lagSeconds: Number(lagSeconds.toFixed(2)) };
      return lagSeconds > OUTBOX_LAG_WARN_SECONDS ? check.down(payload) : check.up(payload);
    } catch (error) {
      return check.down({ message: (error as Error).message });
    }
  }
}
