import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { AppConfig } from '../config/app-config.service.js';
import { UnauthenticatedError } from '../common/errors.js';

export interface AuthenticatedUser {
  readonly id: string;
  readonly email: string;
  readonly role: string;
}

export interface AccessTokenClaims {
  readonly sub: string;
  readonly email: string;
  readonly role: string;
}

export interface RefreshTokenClaims {
  readonly sub: string;
  readonly familyId: string;
  readonly jti: string;
}

export interface AuthTokens {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresIn: number;
  readonly tokenType: 'Bearer';
}

export interface SessionContext {
  readonly ip?: string;
  readonly userAgent?: string;
}

/** Refresh tokens are stored as SHA-256 digests: the raw value only exists in the cookie. */
function digest(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** `15m` / `900s` / `1h` into seconds, for the `expiresIn` the client needs. */
function ttlToSeconds(ttl: string): number {
  const match = /^(\d+)\s*([smhd])?$/.exec(ttl.trim());
  if (!match) return 900;
  const amount = Number(match[1] ?? '900');
  switch ((match[2] ?? 's').toLowerCase()) {
    case 'm':
      return amount * 60;
    case 'h':
      return amount * 3600;
    case 'd':
      return amount * 86400;
    default:
      return amount;
  }
}

/**
 * Access and refresh tokens.
 *
 * The access token is a short-lived JWT the API verifies without a round trip. The
 * refresh token is opaque to the client but is itself a JWT, stored server-side as a
 * hash and rotated on every use. Presenting a refresh token that has already been
 * used means the token was stolen, so the entire token family is revoked: the thief
 * and the victim both lose the session, and the victim is asked to sign in again.
 */
@Injectable()
export class TokensService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: AppConfig,
  ) {}

  /** Start a new session: a new family, so re-use detection stays per-session. */
  async issue(user: AuthenticatedUser, context: SessionContext = {}): Promise<AuthTokens> {
    const familyId = randomUUID();
    const expiresAt = new Date(Date.now() + this.config.refreshTokenTtlDays * 86_400_000);

    const session = await this.prisma.session.create({
      data: {
        userId: user.id,
        ipAddress: context.ip ?? null,
        userAgent: context.userAgent ?? null,
        expiresAt,
      },
    });

    return this.mint(user, familyId, session.id);
  }

  async rotate(rawToken: string, context: SessionContext = {}): Promise<AuthTokens> {
    const claims = await this.verifyRefresh(rawToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: digest(rawToken) },
    });

    if (!stored) {
      throw new UnauthenticatedError('AUTH_REFRESH_UNKNOWN', 'That session is no longer valid.');
    }

    if (stored.usedAt) {
      // Re-use of a rotated token: the family is compromised. Burn it.
      await this.revokeFamily(stored.familyId, 'REUSE_DETECTED');
      throw new UnauthenticatedError(
        'AUTH_REFRESH_REUSE_DETECTED',
        'This session was revoked because a used refresh token was replayed. Sign in again.',
      );
    }

    if (stored.revokedAt) {
      throw new UnauthenticatedError('AUTH_REFRESH_REVOKED', 'This session was signed out.');
    }

    if (stored.expiresAt.getTime() <= Date.now()) {
      throw new UnauthenticatedError('AUTH_REFRESH_EXPIRED', 'This session has expired.');
    }

    const user = await this.prisma.user.findUnique({ where: { id: claims.sub } });
    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthenticatedError('AUTH_USER_INACTIVE', 'This account cannot sign in.');
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { usedAt: new Date() },
    });

    return this.mint(
      { id: user.id, email: user.email, role: user.role },
      stored.familyId,
      stored.sessionId,
      context,
    );
  }

  async verifyAccess(rawToken: string): Promise<AccessTokenClaims> {
    try {
      return await this.jwt.verifyAsync<AccessTokenClaims>(rawToken, {
        secret: this.config.jwtAccessSecret,
      });
    } catch (error) {
      const expired = (error as { name?: string }).name === 'TokenExpiredError';
      throw new UnauthenticatedError(
        expired ? 'AUTH_TOKEN_EXPIRED' : 'AUTH_TOKEN_INVALID',
        expired ? 'Your session has expired. Sign in again.' : 'That access token is not valid.',
      );
    }
  }

  /** Sign out one session. Idempotent: an unknown token is not an error. */
  async revokeByToken(rawToken: string, reason = 'SIGNED_OUT'): Promise<void> {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: digest(rawToken) },
    });
    if (!stored) return;

    await this.prisma.refreshToken.updateMany({
      where: { familyId: stored.familyId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
    if (stored.sessionId) {
      await this.prisma.session.updateMany({
        where: { id: stored.sessionId, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: reason },
      });
    }
  }

  private async revokeFamily(familyId: string, reason: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  private async verifyRefresh(rawToken: string): Promise<RefreshTokenClaims> {
    try {
      return await this.jwt.verifyAsync<RefreshTokenClaims>(rawToken, {
        secret: this.config.jwtRefreshSecret,
      });
    } catch {
      throw new UnauthenticatedError('AUTH_REFRESH_INVALID', 'That refresh token is not valid.');
    }
  }

  private async mint(
    user: AuthenticatedUser,
    familyId: string,
    sessionId: string | null,
    context: SessionContext = {},
  ): Promise<AuthTokens> {
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, email: user.email, role: user.role },
      {
        secret: this.config.jwtAccessSecret,
        expiresIn: ttlToSeconds(this.config.accessTokenTtl),
      },
    );

    const refreshToken = await this.jwt.signAsync(
      { sub: user.id, familyId, jti: randomUUID() },
      {
        secret: this.config.jwtRefreshSecret,
        expiresIn: this.config.refreshTokenTtlDays * 86_400,
      },
    );

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        sessionId,
        familyId,
        tokenHash: digest(refreshToken),
        expiresAt: new Date(Date.now() + this.config.refreshTokenTtlDays * 86_400_000),
      },
    });

    if (sessionId) {
      await this.prisma.session.update({
        where: { id: sessionId },
        data: { lastUsedAt: new Date(), ...(context.ip ? { ipAddress: context.ip } : {}) },
      });
    }

    return {
      accessToken,
      refreshToken,
      expiresIn: ttlToSeconds(this.config.accessTokenTtl),
      tokenType: 'Bearer',
    };
  }
}
