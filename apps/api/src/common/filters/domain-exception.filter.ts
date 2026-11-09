import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import type { Request, Response } from 'express';
import { DomainError } from '../errors.js';

interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    requestId?: string;
  };
}

/**
 * One error shape for the whole API: `{ error: { code, message, details, requestId } }`.
 *
 * Clients never parse prose. They switch on `code`, which is stable and documented,
 * and `details` carries the numbers the UI needs (shortfall, limit, next allowed
 * attempt) so the frontend never has to re-derive them.
 */
@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(DomainExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { id?: string }>();
    const requestId = request?.id;

    const { status, body } = this.toEnvelope(exception, requestId);

    if (status >= 500) {
      this.logger.error(
        `${request?.method} ${request?.url} -> ${status} ${body.error.code}: ${body.error.message}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    } else {
      this.logger.warn(
        `${request?.method} ${request?.url} -> ${status} ${body.error.code}: ${body.error.message}`,
      );
    }

    response.status(status).json(body);
  }

  private toEnvelope(exception: unknown, requestId?: string): { status: number; body: ErrorEnvelope } {
    if (exception instanceof DomainError) {
      return {
        status: exception.httpStatus,
        body: {
          error: {
            code: exception.code,
            message: exception.message,
            ...(exception.details ? { details: exception.details } : {}),
            ...(requestId ? { requestId } : {}),
          },
        },
      };
    }

    if (exception instanceof ZodError) {
      return {
        status: HttpStatus.BAD_REQUEST,
        body: {
          error: {
            code: 'VALIDATION_FAILED',
            message: 'The request body or query is not valid.',
            details: {
              issues: exception.issues.map((issue) => ({
                path: issue.path.join('.'),
                code: issue.code,
                message: issue.message,
              })),
            },
            ...(requestId ? { requestId } : {}),
          },
        },
      };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.fromPrisma(exception, requestId);
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      const message =
        typeof payload === 'string'
          ? payload
          : ((payload as { message?: string | string[] }).message ?? exception.message);
      return {
        status,
        body: {
          error: {
            code: this.codeForStatus(status),
            message: Array.isArray(message) ? message.join('; ') : message,
            ...(requestId ? { requestId } : {}),
          },
        },
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: {
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Something went wrong on our side. The incident has been logged.',
          ...(requestId ? { requestId } : {}),
        },
      },
    };
  }

  private fromPrisma(
    exception: Prisma.PrismaClientKnownRequestError,
    requestId?: string,
  ): { status: number; body: ErrorEnvelope } {
    const withMeta = (code: string, message: string, status: number): { status: number; body: ErrorEnvelope } => ({
      status,
      body: {
        error: {
          code,
          message,
          details: { prismaCode: exception.code, meta: exception.meta as Record<string, unknown> },
          ...(requestId ? { requestId } : {}),
        },
      },
    });

    switch (exception.code) {
      case 'P2002':
        return withMeta('UNIQUE_CONSTRAINT_VIOLATED', 'That record already exists.', 409);
      case 'P2003':
        return withMeta('FOREIGN_KEY_VIOLATED', 'Referenced record does not exist.', 409);
      case 'P2025':
        return withMeta('RECORD_NOT_FOUND', 'That record was not found.', 404);
      case 'P2034':
        // Write conflict: withRetryableTransaction should have absorbed this.
        return withMeta('WRITE_CONFLICT', 'Concurrent write conflict. Retry the request.', 409);
      default:
        return withMeta('DATABASE_ERROR', 'The database rejected that operation.', 500);
    }
  }

  private codeForStatus(status: number): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return 'BAD_REQUEST';
      case HttpStatus.UNAUTHORIZED:
        return 'UNAUTHENTICATED';
      case HttpStatus.FORBIDDEN:
        return 'FORBIDDEN';
      case HttpStatus.NOT_FOUND:
        return 'NOT_FOUND';
      case HttpStatus.CONFLICT:
        return 'CONFLICT';
      case HttpStatus.TOO_MANY_REQUESTS:
        return 'RATE_LIMITED';
      case HttpStatus.UNPROCESSABLE_ENTITY:
        return 'UNPROCESSABLE';
      default:
        return 'HTTP_ERROR';
    }
  }
}
