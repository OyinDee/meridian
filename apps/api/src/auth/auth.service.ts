import { Injectable, Logger } from '@nestjs/common';
import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2';
import { createHmac } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type { LoginRequest, RegisterRequest } from '@meridian/contracts';
import { PrismaService } from '../prisma/prisma.service.js';
import { AppConfig } from '../config/app-config.service.js';
import {
  AccountLockedError,
  ConflictError,
  InvalidCredentialsError,
  NotFoundError,
} from '../common/errors.js';
import { TokensService, type AuthTokens, type SessionContext } from './tokens.service.js';

const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MINUTES = 15;

export interface UserView {
  readonly id: string;
  readonly email: string;
  readonly phone: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly role: string;
  readonly kycStatus: string;
  readonly createdAt: string;
}

export interface RegisterResult {
  readonly user: UserView;
  readonly accounts: readonly { id: string; accountNumber: string; type: string }[];
  readonly tokens: AuthTokens;
}

export interface LoginResult {
  readonly user: UserView;
  readonly tokens: AuthTokens;
}

/**
 * Identity: registration, sign-in, and the account a customer gets on day one.
 *
 * Passwords are hashed with Argon2id using the configured cost parameters, never
 * with a general-purpose digest. The BVN is stored only as a keyed HMAC, which is
 * enough to detect a duplicate application while keeping the number itself out of
 * the database entirely.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
    private readonly tokens: TokensService,
  ) {}

  async register(input: RegisterRequest, context: SessionContext = {}): Promise<RegisterResult> {
    const bvnHash = this.hashBvn(input.bvn);
    await this.assertIdentityIsFree(input.email, input.phone, bvnHash);

    const passwordHash = await argonHash(input.password, {
      memoryCost: this.config.argon2.memoryCost,
      timeCost: this.config.argon2.timeCost,
      parallelism: this.config.argon2.parallelism,
    });

    const { user, account } = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: input.email.toLowerCase(),
          phone: input.phone,
          passwordHash,
          firstName: input.firstName,
          lastName: input.lastName,
          dateOfBirth: new Date(`${input.dateOfBirth}T00:00:00.000Z`),
          bvnHash,
          bvnLast4: input.bvn.slice(-4),
          profile: {
            create: {},
          },
        },
      });

      // A new customer is not useful until they have somewhere to put money, so
      // registration opens a current account in the home currency.
      const opened = await this.openCustomerAccount(tx, created.id, 'CURRENT', 'My current account');

      return { user: created, account: opened };
    });

    const userView = toUserView(user);
    const tokens = await this.tokens.issue(
      { id: user.id, email: user.email, role: user.role },
      context,
    );

    this.logger.log(`Registered customer ${user.id}`);

    return {
      user: userView,
      accounts: [
        { id: account.id, accountNumber: account.accountNumber, type: account.type },
      ],
      tokens,
    };
  }

  async login(input: LoginRequest, context: SessionContext = {}): Promise<LoginResult> {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email.toLowerCase() },
    });

    // A dummy verify keeps the timing of "unknown email" and "wrong password"
    // indistinguishable, so the endpoint cannot be used to enumerate customers.
    if (!user) {
      await argonVerify(
        '$argon2id$v=19$m=19456,t=2,p=1$c2FsdHNhbHRzYWx0c2FsdA$3S0kQ0G7Zx0k1kJ0m8Q0k0hQ0m0Z0c0S0Q0d0k0Q0k0',
        input.password,
      ).catch(() => false);
      throw new InvalidCredentialsError();
    }

    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      throw new AccountLockedError(Math.ceil((user.lockedUntil.getTime() - Date.now()) / 1000));
    }

    if (user.status !== 'ACTIVE') {
      throw new InvalidCredentialsError();
    }

    const passwordMatches = await argonVerify(user.passwordHash, input.password).catch(() => false);

    if (!passwordMatches) {
      const failedLoginCount = user.failedLoginCount + 1;
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginCount,
          lockedUntil:
            failedLoginCount >= MAX_FAILED_LOGINS
              ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000)
              : null,
        },
      });
      throw new InvalidCredentialsError();
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
    });

    const tokens = await this.tokens.issue(
      { id: user.id, email: user.email, role: user.role },
      context,
    );

    return { user: toUserView(user), tokens };
  }

  async me(userId: string): Promise<UserView & { accounts: readonly unknown[] }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        accounts: {
          where: { status: 'ACTIVE' },
          include: { balance: true },
          orderBy: { openedAt: 'asc' },
        },
      },
    });

    if (!user) throw new NotFoundError('USER_NOT_FOUND', 'That customer no longer exists.');

    return {
      ...toUserView(user),
      accounts: user.accounts.map((account) => ({
        id: account.id,
        accountNumber: account.accountNumber,
        type: account.type,
        currency: account.currency,
        nickname: account.nickname,
        status: account.status,
        balanceMinor: (account.balance?.balanceMinor ?? 0n).toString(),
        availableMinor: (account.balance?.availableMinor ?? 0n).toString(),
        holdsMinor: (account.balance?.holdsMinor ?? 0n).toString(),
      })),
    };
  }

  async logout(refreshToken: string): Promise<void> {
    await this.tokens.revokeByToken(refreshToken);
  }

  // ------------------------------------------------------------------ helpers

  private hashBvn(bvn: string): string {
    return createHmac('sha256', this.config.bvnHashKey).update(bvn).digest('hex');
  }

  private async assertIdentityIsFree(
    email: string,
    phone: string,
    bvnHash: string,
  ): Promise<void> {
    const existing = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: email.toLowerCase() }, { phone }, { bvnHash }],
      },
      select: { email: true, phone: true, bvnHash: true },
    });

    if (!existing) return;

    if (existing.email === email.toLowerCase()) {
      throw new ConflictError('EMAIL_ALREADY_REGISTERED', 'That email already has an account.');
    }
    if (existing.phone === phone) {
      throw new ConflictError('PHONE_ALREADY_REGISTERED', 'That phone number is already in use.');
    }
    throw new ConflictError('BVN_ALREADY_REGISTERED', 'That BVN is already registered.');
  }

  /**
   * Open a customer deposit account with a unique 10-digit NUBAN.
   *
   * The number is generated here and the unique index is the arbiter: a collision
   * surfaces as P2002 and the loop simply tries another number, which keeps the
   * allocation race-free without a lock.
   */
  private async openCustomerAccount(
    tx: Prisma.TransactionClient,
    userId: string,
    type: 'CURRENT' | 'SAVINGS' | 'DOMICILIARY',
    nickname: string,
  ): Promise<{ id: string; accountNumber: string; type: string }> {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const accountNumber = generateAccountNumber();

      try {
        const account = await tx.account.create({
          data: {
            accountNumber,
            ledgerCode: `2${accountNumber}`,
            userId,
            type,
            currency: this.config.homeCurrency,
            normalBalance: 'CREDIT',
            nickname,
            allowOverdraft: false,
            overdraftLimitMinor: 0n,
            minimumBalanceMinor: 0n,
          },
        });

        return { id: account.id, accountNumber: account.accountNumber, type: account.type };
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          continue;
        }
        throw error;
      }
    }

    throw new ConflictError(
      'ACCOUNT_NUMBER_EXHAUSTED',
      'Could not allocate an account number. Try again.',
    );
  }
}

/** 10-digit NUBAN: a bank prefix followed by random digits. */
function generateAccountNumber(): string {
  const prefix = '90';
  let suffix = '';
  for (let index = 0; index < 8; index += 1) {
    suffix += Math.floor(Math.random() * 10).toString();
  }
  return `${prefix}${suffix}`;
}

function toUserView(user: {
  id: string;
  email: string;
  phone: string;
  firstName: string;
  lastName: string;
  role: string;
  kycStatus: string;
  createdAt: Date;
}): UserView {
  return {
    id: user.id,
    email: user.email,
    phone: user.phone,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    kycStatus: user.kycStatus,
    createdAt: user.createdAt.toISOString(),
  };
}
