import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { AppConfig } from '../config/app-config.service.js';

/**
 * Prisma client for the CRUD surface of the app.
 *
 * The ledger's hot path deliberately does *not* go through Prisma: it uses
 * `PgService` with hand-written SQL so that isolation levels, row locks and
 * deferred constraints are all explicit. See ADR 0004.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(config: AppConfig) {
    super({
      datasourceUrl: config.databaseUrlPooled,
      errorFormat: 'minimal',
      log:
        config.nodeEnv === 'development'
          ? [
              { emit: 'event', level: 'warn' },
              { emit: 'event', level: 'error' },
            ]
          : [{ emit: 'event', level: 'error' }],
    });
  }

  async onModuleInit(): Promise<void> {
    this.$on('warn' as never, (event: Prisma.LogEvent) => this.logger.warn(event.message));
    this.$on('error' as never, (event: Prisma.LogEvent) => this.logger.error(event.message));
    await this.$connect();
    this.logger.log('Connected to Postgres via the pooled endpoint');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /** Liveness probe target. */
  async ping(): Promise<void> {
    await this.$queryRaw`SELECT 1`;
  }
}
