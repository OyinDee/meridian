import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import { AppConfig } from './config/app-config.service.js';
import { AppConfigModule } from './config/config.module.js';
import { AccountsModule } from './accounts/accounts.module.js';
import { AuthModule } from './auth/auth.module.js';
import { BeneficiariesModule } from './beneficiaries/beneficiaries.module.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthModule } from './health/health.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { TransfersModule } from './transfers/transfers.module.js';
import { ObservabilityModule } from './observability/observability.module.js';

const schedulersEnabled = process.env.ENABLE_SCHEDULERS !== 'false';

@Module({
  imports: [
    AppConfigModule,

    // Structured JSON logs with a request id that is echoed in error envelopes and
    // in the audit log, so a customer's complaint can be traced end to end.
    LoggerModule.forRootAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({
        pinoHttp: {
          level: config.logLevel,
          genReqId: (req: { headers: Record<string, string | string[] | undefined> }) =>
            (req.headers['x-request-id'] as string | undefined) ?? randomUUID(),
          redact: {
            paths: [
              'req.headers.authorization',
              'req.headers.cookie',
              'res.headers["set-cookie"]',
              'req.body.password',
              'req.body.pin',
              'req.body.totp',
              'req.body.bvn',
            ],
            censor: '[redacted]',
          },
          autoLogging: {
            ignore: (req: { headers: Record<string, string | string[] | undefined>; url?: string }) =>
              Boolean(req.url?.startsWith('/health') || req.url?.startsWith('/metrics')),
          },
          transport:
            config.nodeEnv === 'development'
              ? {
                  target: 'pino-pretty',
                  options: { singleLine: true, translateTime: 'SYS:HH:MM:ss.l', ignore: 'pid,hostname' },
                }
              : undefined,
        },
      }),
    }),

    ...(schedulersEnabled ? [ScheduleModule.forRoot()] : []),

    // A blunt global ceiling; per-endpoint limits (login, transfers) are tighter
    // and live on the controllers that need them.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 240 }]),

    PrismaModule,
    DatabaseModule,
    AuthModule,
    AccountsModule,
    TransfersModule,
    BeneficiariesModule,
    NotificationsModule,
    ObservabilityModule,
    HealthModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
