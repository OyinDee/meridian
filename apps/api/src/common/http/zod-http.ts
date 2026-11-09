import {
  createParamDecorator,
  ExecutionContext,
  type PipeTransform,
  type ArgumentMetadata,
} from '@nestjs/common';
import type { ZodType } from 'zod';

/**
 * Request validation with Zod, reusing the schemas in `@meridian/contracts`.
 *
 * One schema serves the API boundary, the frontend form and the integration
 * tests, so a rule can never drift between them. Money arrives as a decimal
 * string and is parsed into exact minor units, never through `Number`.
 */
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown, _metadata: ArgumentMetadata): T {
    // Throwing ZodError is intentional: DomainExceptionFilter turns it into a
    // 400 with a per-field issue list.
    return this.schema.parse(value);
  }
}

export const ZodBody = <T>(schema: ZodType<T>): ZodValidationPipe<T> =>
  new ZodValidationPipe(schema);

export const ZodQuery = <T>(schema: ZodType<T>): ZodValidationPipe<T> =>
  new ZodValidationPipe(schema);

export const ZodParam = <T>(schema: ZodType<T>): ZodValidationPipe<T> =>
  new ZodValidationPipe(schema);

/** Raw headers, per the Fetch spec's case-insensitive access. */
export interface NormalizedHeaders {
  readonly idempotencyKey?: string;
  readonly userAgent?: string;
  readonly ip: string;
  readonly lastEventId?: string;
}

export const Headers = createParamDecorator((_data: unknown, ctx: ExecutionContext): NormalizedHeaders => {
  const request = ctx.switchToHttp().getRequest<{
    headers: Record<string, string | string[] | undefined>;
    ip?: string;
    socket?: { remoteAddress?: string };
    ips?: string[];
  }>();

  const first = (name: string): string | undefined => {
    const value = request.headers[name];
    return Array.isArray(value) ? value[0] : value;
  };

  return {
    idempotencyKey: first('idempotency-key'),
    userAgent: first('user-agent'),
    // trust proxy is enabled in main.ts, so behind a load balancer this is the client.
    ip: request.ips?.[0] ?? request.ip ?? request.socket?.remoteAddress ?? '0.0.0.0',
    lastEventId: first('last-event-id'),
  };
});
