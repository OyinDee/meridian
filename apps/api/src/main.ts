import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Logger as PinoLogger } from 'nestjs-pino';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module.js';
import { AppConfig } from './config/app-config.service.js';
import { DomainExceptionFilter } from './common/filters/domain-exception.filter.js';
import { installBigIntJson } from './common/bigint-json.js';
import { setupSwagger } from './openapi/setup-swagger.js';

async function bootstrap(): Promise<void> {
  // Money is BigInt everywhere; make JSON serialisation exact before anything runs.
  installBigIntJson();

  const app = await NestFactory.create(AppModule, { bufferLogs: true, bodyParser: true });
  const logger = app.get(PinoLogger);
  app.useLogger(logger);
  app.flushLogs();

  const config = app.get(AppConfig);
  const express = app.getHttpAdapter().getInstance() as {
    set: (key: string, value: unknown) => void;
  };
  // Behind a load balancer: req.ip must be the customer's address, because the risk
  // engine scores by IP and the audit log records it.
  express.set('trust proxy', 1);

  app.use(
    helmet({
      // The API serves JSON and an SSE stream, never HTML pages, so CSP can be strict.
      contentSecurityPolicy: {
        directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"], baseUri: ["'none'"] },
      },
      crossOriginResourcePolicy: { policy: 'same-site' },
      hsts: config.isProduction ? { maxAge: 63_072_000, includeSubDomains: true, preload: true } : false,
    }),
  );
  app.use(compression());
  app.use(cookieParser());

  app.enableCors({
    origin: config.webOrigin.split(',').map((origin) => origin.trim()),
    credentials: true,
    exposedHeaders: ['x-request-id', 'retry-after'],
    allowedHeaders: ['content-type', 'authorization', 'idempotency-key', 'x-request-id', 'last-event-id', 'x-mfa-code'],
  });

  app.setGlobalPrefix(config.apiPrefix, {
    // Probes stay unprefixed so infrastructure does not need to know the API version.
    exclude: ['health', 'health/ready', 'metrics'],
  });

  // All request validation is Zod, applied per route by ZodValidationPipe
  // (see common/http/zod-http.ts), so the boundary and the shared contracts
  // cannot drift apart.
  app.useGlobalFilters(new DomainExceptionFilter());

  app.enableShutdownHooks();

  if (!config.isProduction) {
    setupSwagger(app, config);
  }

  await app.listen(config.port, '0.0.0.0');

  new Logger('Bootstrap').log(
    `Meridian API listening on :${config.port} | ${config.homeCurrency} | ${config.timezone} | env=${config.nodeEnv}`,
  );
  if (!config.isProduction) {
    new Logger('Bootstrap').log(
      `Docs: http://localhost:${config.port}/${config.apiPrefix}/docs | SSE: /${config.apiPrefix}/realtime/stream`,
    );
  }
}

void bootstrap();
