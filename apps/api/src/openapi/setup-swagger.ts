import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { z, type ZodType } from 'zod';
import { AppConfig } from '../config/app-config.service.js';

/**
 * Request/response bodies are described by the same Zod schemas that validate them.
 * Zod 4 can emit JSON Schema, so the OpenAPI document is generated from the single
 * source of truth instead of hand-maintained DTO classes.
 */
export function jsonSchemaOf<T>(schema: ZodType<T>): Record<string, unknown> {
  const json = z.toJSONSchema(schema, { io: 'input' }) as Record<string, unknown>;
  delete json.$schema;
  return json;
}

export function setupSwagger(app: INestApplication, config: AppConfig): void {
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Meridian Bank API')
      .setDescription(
        [
          'Core banking API for the Meridian demo bank.',
          '',
          'Money is always transported as a decimal string in minor units (kobo for NGN),',
          'never as a float. Every balance change is a double-entry journal transaction.',
          '',
          '`POST /transfers` honours an `Idempotency-Key` header: repeating the same',
          'request with the same key and body returns the original response instead of',
          'moving money twice.',
        ].join('\n'),
      )
      .setVersion('0.1.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
      .addServer(`http://localhost:${config.port}`, 'Local')
      .addTag('auth', 'Sessions, MFA and device trust')
      .addTag('accounts', 'Accounts, balances and statements')
      .addTag('ledger', 'Journal transactions and entries')
      .addTag('transfers', 'Internal, NIP and scheduled transfers')
      .addTag('deposits', 'Cash and settlement deposits')
      .addTag('limits', 'Per-transaction, daily and monthly limits')
      .addTag('risk', 'Risk engine decisions and review queue')
      .addTag('realtime', 'Server-Sent Events stream')
      .addTag('loans', 'Loan origination, schedules and repayment')
      .addTag('interest', 'Savings interest accrual and posting')
      .addTag('cards', 'Card issuance and authorisations')
      .addTag('fx', 'FX rates, quotes and conversion')
      .addTag('ops', 'Reconciliation, ledger proofs and admin operations')
      .build(),
  );

  SwaggerModule.setup(`${config.apiPrefix}/docs`, app, document, {
    jsonDocumentUrl: `${config.apiPrefix}/docs/openapi.json`,
    customSiteTitle: 'Meridian Bank API',
    swaggerOptions: { persistAuthorization: true, displayRequestDuration: true, filter: true },
  });
}
