import { createParamDecorator, ExecutionContext, Injectable, type CanActivate } from '@nestjs/common';
import type { Request } from 'express';
import { UnauthenticatedError } from '../common/errors.js';
import { TokensService, type AccessTokenClaims } from './tokens.service.js';

export interface AuthenticatedRequest extends Request {
  user?: AccessTokenClaims;
}

/**
 * Bearer-token guard.
 *
 * Attached per route rather than globally, so the few genuinely public endpoints
 * (`/auth/register`, `/auth/login`, `/auth/refresh`, `/health`) do not need an
 * opt-out. A missing or malformed header is a 401 with a stable code the client can
 * switch on: the web app uses `AUTH_TOKEN_EXPIRED` to trigger a silent refresh.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly tokens: TokensService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers.authorization;

    if (!header || !header.startsWith('Bearer ')) {
      throw new UnauthenticatedError();
    }

    request.user = await this.tokens.verifyAccess(header.slice('Bearer '.length).trim());
    return true;
  }
}

/** The verified access-token claims for the current request. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AccessTokenClaims => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.user) throw new UnauthenticatedError();
    return request.user;
  },
);
