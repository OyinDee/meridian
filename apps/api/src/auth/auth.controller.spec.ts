import { InvalidCredentialsError } from '../common/errors.js';
import { DomainExceptionFilter } from '../common/filters/domain-exception.filter.js';
import { AuthController } from './auth.controller.js';
import { AppConfig } from '../config/app-config.service.js';
import { AuthService } from './auth.service.js';
import { TokensService } from './tokens.service.js';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

describe('AuthController login', () => {
  let app: INestApplication;
  const auth = {
    login: vi.fn(),
  };
  const tokens = {
    rotate: vi.fn(),
  };
  const config = {
    apiPrefix: 'api',
    isProduction: false,
    refreshTokenTtlDays: 30,
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: TokensService, useValue: tokens },
        { provide: AppConfig, useValue: config },
      ],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalFilters(new DomainExceptionFilter());
    await app.init();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    auth.login.mockResolvedValue({
      user: {
        id: 'user-1',
        email: 'customer@example.com',
        firstName: 'Test',
        lastName: 'Customer',
      },
      tokens: {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresIn: 900,
        tokenType: 'Bearer',
      },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('validates credentials, returns the access token, and sets the refresh cookie', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .set('User-Agent', 'login-test-agent')
      .send({ email: 'customer@example.com', password: 'correct-password' })
      .expect(200);

    expect(auth.login).toHaveBeenCalledWith(
      { email: 'customer@example.com', password: 'correct-password' },
      expect.objectContaining({ userAgent: 'login-test-agent' }),
    );
    expect(response.body).toMatchObject({
      user: { id: 'user-1', email: 'customer@example.com' },
      accessToken: 'access-token',
      expiresIn: 900,
    });
    expect(response.body).not.toHaveProperty('refreshToken');

    const cookie = String(response.headers['set-cookie']);
    expect(cookie).toContain('meridian_refresh=refresh-token');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Path=/api/auth');
    expect(cookie).toContain('SameSite=Lax');
  });

  it('returns a validation error for malformed login input', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'not-an-email', password: '' })
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_FAILED');
    expect(auth.login).not.toHaveBeenCalled();
  });

  it('returns the standard unauthenticated envelope for invalid credentials', async () => {
    auth.login.mockRejectedValue(new InvalidCredentialsError());

    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'customer@example.com', password: 'wrong-password' })
      .expect(401);

    expect(response.body.error.code).toBe('AUTH_INVALID_CREDENTIALS');
    expect(response.body.error.message).toBe('Email or password is incorrect.');
  });
});
