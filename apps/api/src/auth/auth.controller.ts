import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { loginSchema, refreshSchema, registerSchema } from '@meridian/contracts';
import type { LoginRequest, RefreshRequest, RegisterRequest } from '@meridian/contracts';
import { ZodBody } from '../common/http/zod-http.js';
import { AppConfig } from '../config/app-config.service.js';
import { UnauthenticatedError } from '../common/errors.js';
import { AuthService } from './auth.service.js';
import { CurrentUser, JwtAuthGuard, type AuthenticatedRequest } from './jwt-auth.guard.js';
import { TokensService } from './tokens.service.js';

/** The refresh token only ever travels in this cookie; the SPA cannot read it. */
const REFRESH_COOKIE = 'meridian_refresh';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly tokens: TokensService,
    private readonly config: AppConfig,
  ) {}

  @Post('register')
  @ApiOperation({ summary: 'Open a customer account and sign in' })
  async register(
    @Body(ZodBody(registerSchema)) input: RegisterRequest,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ user: unknown; accounts: unknown; accessToken: string; expiresIn: number }> {
    const result = await this.auth.register(input, contextOf(request));
    this.setRefreshCookie(response, result.tokens.refreshToken);

    return {
      user: result.user,
      accounts: result.accounts,
      accessToken: result.tokens.accessToken,
      expiresIn: result.tokens.expiresIn,
    };
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign in with email and password' })
  async login(
    @Body(ZodBody(loginSchema)) input: LoginRequest,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ user: unknown; accessToken: string; expiresIn: number }> {
    const result = await this.auth.login(input, contextOf(request));
    this.setRefreshCookie(response, result.tokens.refreshToken);

    return {
      user: result.user,
      accessToken: result.tokens.accessToken,
      expiresIn: result.tokens.expiresIn,
    };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exchange the refresh cookie for a new access token' })
  async refresh(
    @Body(ZodBody(refreshSchema.partial())) _input: Partial<RefreshRequest>,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ accessToken: string; expiresIn: number }> {
    const raw = readRefreshCookie(request);
    if (!raw) throw new UnauthenticatedError('AUTH_REFRESH_MISSING', 'No session to refresh.');

    const rotated = await this.tokens.rotate(raw, contextOf(request));
    this.setRefreshCookie(response, rotated.refreshToken);

    return { accessToken: rotated.accessToken, expiresIn: rotated.expiresIn };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Sign out the current session' })
  async logout(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const raw = readRefreshCookie(request);
    if (raw) await this.auth.logout(raw);
    response.clearCookie(REFRESH_COOKIE, { path: `/${this.config.apiPrefix}/auth` });
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'The signed-in customer and their accounts' })
  me(@CurrentUser() user: { sub: string }): Promise<unknown> {
    return this.auth.me(user.sub);
  }

  private setRefreshCookie(response: Response, token: string): void {
    response.cookie(REFRESH_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.config.isProduction,
      // Scoped to the auth routes: an XSS in a page component cannot read it, and it
      // is not attached to ordinary API calls either.
      path: `/${this.config.apiPrefix}/auth`,
      maxAge: this.config.refreshTokenTtlDays * 86_400_000,
    });
  }
}

function contextOf(request: AuthenticatedRequest): { ip?: string; userAgent?: string } {
  return {
    ip: request.ip,
    userAgent: request.headers['user-agent'],
  };
}

function readRefreshCookie(request: AuthenticatedRequest): string | undefined {
  const cookies = (request as AuthenticatedRequest & { cookies?: Record<string, string> }).cookies;
  return cookies?.[REFRESH_COOKIE];
}
