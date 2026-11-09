/**
 * Development seed.
 *
 * Idempotent: re-running it upserts identity data and skips any journal whose
 * reference already exists. Money is created only through PostingService, so the
 * hash chain, balance cache and ledger triggers are exercised exactly as they are
 * in production instead of being bypassed with raw INSERTs.
 */
import 'reflect-metadata';
import { createHmac } from 'node:crypto';
import { hash as argonHash } from '@node-rs/argon2';
import { PrismaClient } from '@prisma/client';
import type { CurrencyCode } from '@meridian/money';
import type { AppConfig } from '../src/config/app-config.service.js';
import { PgService } from '../src/database/pg.service.js';
import { PostingService } from '../src/ledger/posting.service.js';
import type { PostJournalInput } from '../src/ledger/ledger.types.js';

const CURRENCY: CurrencyCode = 'NGN';
const DEMO_PASSWORD = 'Meridian#2026';

const prisma = new PrismaClient();

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

const config = {
  timezone: process.env.BANK_TIMEZONE ?? 'Africa/Lagos',
  databaseUrl: requireEnv('DATABASE_URL'),
  databaseUrlPooled: requireEnv('DATABASE_URL_POOLED'),
  dbPoolMax: Number(process.env.DB_POOL_MAX ?? 10),
  dbStatementTimeoutMs: Number(process.env.DB_STATEMENT_TIMEOUT_MS ?? 15_000),
} as unknown as AppConfig;

const pg = new PgService(config);
const posting = new PostingService(pg, config);

const daysAgo = (days: number): Date => {
  const when = new Date();
  when.setUTCDate(when.getUTCDate() - days);
  return when;
};

interface SeedAccount {
  readonly accountNumber: string;
  readonly ledgerCode: string;
  readonly type: 'CURRENT' | 'SAVINGS' | 'DOMICILIARY' | 'INTERNAL';
  readonly normalBalance: 'DEBIT' | 'CREDIT';
  readonly nickname: string;
  readonly openingMinor: bigint;
}

interface SeedUser {
  readonly email: string;
  readonly phone: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly dateOfBirth: string;
  readonly bvn: string;
  readonly kycStatus: 'UNVERIFIED' | 'PENDING' | 'VERIFIED' | 'REJECTED';
  readonly role: 'CUSTOMER' | 'TELLER' | 'OFFICER' | 'ADMIN' | 'AUDITOR';
  readonly accounts: readonly SeedAccount[];
}

const BANK_CASH: SeedAccount = {
  accountNumber: '1000000001',
  ledgerCode: '1000000001',
  type: 'INTERNAL',
  normalBalance: 'DEBIT',
  nickname: 'Bank cash and NIBSS settlement',
  openingMinor: 0n,
};

const OPENING_EQUITY: SeedAccount = {
  accountNumber: '3000000001',
  ledgerCode: '3000000001',
  type: 'INTERNAL',
  normalBalance: 'CREDIT',
  nickname: 'Opening balances (demo)',
  openingMinor: 0n,
};

const users: readonly SeedUser[] = [
  {
    email: 'demo@meridian.ng',
    phone: '08031234567',
    firstName: 'Ada',
    lastName: 'Okafor',
    dateOfBirth: '1992-04-18',
    bvn: '22222222222',
    kycStatus: 'VERIFIED',
    role: 'CUSTOMER',
    accounts: [
      {
        accountNumber: '9010000001',
        ledgerCode: '29010000001',
        type: 'CURRENT',
        normalBalance: 'CREDIT',
        nickname: 'Everyday current account',
        openingMinor: 125_000_000n,
      },
      {
        accountNumber: '9010000002',
        ledgerCode: '29010000002',
        type: 'SAVINGS',
        normalBalance: 'CREDIT',
        nickname: 'Rainy day savings',
        openingMinor: 48_000_000n,
      },
    ],
  },
  {
    email: 'tunde@meridian.ng',
    phone: '08141234568',
    firstName: 'Tunde',
    lastName: 'Bakare',
    dateOfBirth: '1988-11-02',
    bvn: '33333333333',
    kycStatus: 'VERIFIED',
    role: 'CUSTOMER',
    accounts: [
      {
        accountNumber: '9010000011',
        ledgerCode: '29010000011',
        type: 'CURRENT',
        normalBalance: 'CREDIT',
        nickname: 'Salary account',
        openingMinor: 92_500_000n,
      },
    ],
  },
  {
    email: 'officer@meridian.ng',
    phone: '08161234569',
    firstName: 'Ngozi',
    lastName: 'Eze',
    dateOfBirth: '1985-01-25',
    bvn: '44444444444',
    kycStatus: 'VERIFIED',
    role: 'OFFICER',
    accounts: [],
  },
];

async function upsertAccount(account: SeedAccount, userId: string | null): Promise<string> {
  const record = await prisma.account.upsert({
    where: { accountNumber: account.accountNumber },
    update: {},
    create: {
      accountNumber: account.accountNumber,
      ledgerCode: account.ledgerCode,
      userId,
      type: account.type,
      status: 'ACTIVE',
      currency: CURRENCY,
      normalBalance: account.normalBalance,
      nickname: account.nickname,
      allowOverdraft: false,
      overdraftLimitMinor: 0n,
      minimumBalanceMinor: 0n,
      updatedAt: new Date(),
    },
    select: { id: true },
  });
  return record.id;
}

async function postOnce(input: PostJournalInput): Promise<boolean> {
  const reference = input.reference;
  if (!reference) throw new Error('Seed journals must carry an explicit reference');
  const existing = await prisma.journalTransaction.findUnique({ where: { reference }, select: { id: true } });
  if (existing) return false;
  await posting.post({ ...input, idempotencyKey: `seed:${reference}` }, { label: `seed:${reference}` });
  return true;
}

async function main(): Promise<void> {
  await pg.onModuleInit();

  const bvnHashKey = requireEnv('BVN_HASH_KEY');
  const passwordHash = await argonHash(DEMO_PASSWORD, {
    memoryCost: Number(process.env.ARGON2_MEMORY_KIB ?? 19_456),
    timeCost: Number(process.env.ARGON2_TIME_COST ?? 2),
    parallelism: Number(process.env.ARGON2_PARALLELISM ?? 1),
  });

  const bankCashId = await upsertAccount(BANK_CASH, null);
  await upsertAccount(OPENING_EQUITY, null);

  const accountsByNumber = new Map<string, string>();

  for (const user of users) {
    const bvnHash = createHmac('sha256', bvnHashKey).update(user.bvn).digest('hex');
    const record = await prisma.user.upsert({
      where: { email: user.email },
      update: {
        status: 'ACTIVE',
        kycStatus: user.kycStatus,
        passwordHash,
        failedLoginCount: 0,
        lockedUntil: null,
      },
      create: {
        email: user.email,
        phone: user.phone,
        passwordHash,
        firstName: user.firstName,
        lastName: user.lastName,
        dateOfBirth: new Date(`${user.dateOfBirth}T00:00:00.000Z`),
        bvnHash,
        bvnLast4: user.bvn.slice(-4),
        status: 'ACTIVE',
        kycStatus: user.kycStatus,
        role: user.role,
        updatedAt: new Date(),
      },
      select: { id: true },
    });

    await prisma.customerProfile.upsert({
      where: { userId: record.id },
      update: {},
      create: {
        userId: record.id,
        city: 'Lagos',
        state: 'Lagos',
        occupation: 'Professional',
        updatedAt: new Date(),
      },
    });

    for (const account of user.accounts) {
      const accountId = await upsertAccount(account, record.id);
      accountsByNumber.set(account.accountNumber, accountId);

      if (account.openingMinor > 0n) {
        await postOnce({
          kind: 'OPENING_BALANCE',
          currency: CURRENCY,
          narrative: `Opening balance for ${account.accountNumber}`,
          reference: `SEED-OB-${account.accountNumber}`,
          valueDate: daysAgo(30),
          bookedAt: daysAgo(30),
          initiatedByUserId: record.id,
          legs: [
            { accountId: bankCashId, direction: 'DEBIT', amountMinor: account.openingMinor },
            {
              accountId,
              direction: 'CREDIT',
              amountMinor: account.openingMinor,
              narration: 'Account opened',
            },
          ],
        });
      }
    }
  }

  const demoUser = await prisma.user.findUniqueOrThrow({ where: { email: 'demo@meridian.ng' }, select: { id: true } });
  const demoCurrent = accountsByNumber.get('9010000001');
  const demoSavings = accountsByNumber.get('9010000002');
  const tundeCurrent = accountsByNumber.get('9010000011');
  if (!demoCurrent || !demoSavings || !tundeCurrent) throw new Error('Seed accounts were not created');

  const activity: readonly PostJournalInput[] = [
    {
      kind: 'DEPOSIT',
      currency: CURRENCY,
      narrative: 'Salary — Acme Ltd',
      reference: 'SEED-TX-DEP-0001',
      valueDate: daysAgo(20),
      bookedAt: daysAgo(20),
      initiatedByUserId: demoUser.id,
      legs: [
        { accountId: bankCashId, direction: 'DEBIT', amountMinor: 15_000_000n },
        { accountId: demoCurrent, direction: 'CREDIT', amountMinor: 15_000_000n, narration: 'Salary — Acme Ltd' },
      ],
    },
    {
      kind: 'DEPOSIT',
      currency: CURRENCY,
      narrative: 'Salary — Northwind Trading',
      reference: 'SEED-TX-DEP-0002',
      valueDate: daysAgo(8),
      bookedAt: daysAgo(8),
      initiatedByUserId: demoUser.id,
      legs: [
        { accountId: bankCashId, direction: 'DEBIT', amountMinor: 25_000_000n },
        { accountId: tundeCurrent, direction: 'CREDIT', amountMinor: 25_000_000n, narration: 'Salary' },
      ],
    },
    {
      kind: 'INTERNAL_TRANSFER',
      currency: CURRENCY,
      narrative: 'Savings sweep',
      reference: 'SEED-TX-TRF-0001',
      valueDate: daysAgo(12),
      bookedAt: daysAgo(12),
      initiatedByUserId: demoUser.id,
      legs: [
        { accountId: demoCurrent, direction: 'DEBIT', amountMinor: 8_000_000n, narration: 'Transfer to savings' },
        { accountId: demoSavings, direction: 'CREDIT', amountMinor: 8_000_000n, narration: 'Transfer from current' },
      ],
    },
    {
      kind: 'WITHDRAWAL',
      currency: CURRENCY,
      narrative: 'ATM withdrawal — Lekki Phase 1',
      reference: 'SEED-TX-WDR-0001',
      valueDate: daysAgo(5),
      bookedAt: daysAgo(5),
      initiatedByUserId: demoUser.id,
      legs: [
        { accountId: demoCurrent, direction: 'DEBIT', amountMinor: 3_500_000n, narration: 'ATM withdrawal' },
        { accountId: bankCashId, direction: 'CREDIT', amountMinor: 3_500_000n },
      ],
    },
    {
      kind: 'INTERNAL_TRANSFER',
      currency: CURRENCY,
      narrative: 'Rent contribution',
      reference: 'SEED-TX-TRF-0002',
      valueDate: daysAgo(2),
      bookedAt: daysAgo(2),
      initiatedByUserId: demoUser.id,
      legs: [
        { accountId: tundeCurrent, direction: 'DEBIT', amountMinor: 6_000_000n, narration: 'Rent — transfer to Ada' },
        { accountId: demoCurrent, direction: 'CREDIT', amountMinor: 6_000_000n, narration: 'Rent contribution from Tunde' },
      ],
    },
    {
      kind: 'WITHDRAWAL',
      currency: CURRENCY,
      narrative: 'POS purchase — Ikeja',
      reference: 'SEED-TX-WDR-0002',
      valueDate: daysAgo(1),
      bookedAt: daysAgo(1),
      initiatedByUserId: demoUser.id,
      legs: [
        { accountId: tundeCurrent, direction: 'DEBIT', amountMinor: 2_000_000n, narration: 'POS purchase' },
        { accountId: bankCashId, direction: 'CREDIT', amountMinor: 2_000_000n },
      ],
    },
  ];

  let posted = 0;
  for (const journal of activity) {
    if (await postOnce(journal)) posted += 1;
  }

  await prisma.limitProfile.upsert({
    where: { accountId: demoCurrent },
    update: {},
    create: {
      userId: demoUser.id,
      accountId: demoCurrent,
      perTransactionMinor: 100_000_000n,
      dailyMinor: 500_000_000n,
      monthlyMinor: 5_000_000_000n,
      currency: CURRENCY,
      updatedAt: new Date(),
    },
  });

  const beneficiaries = [
    { name: 'Chidi Nwosu', accountNumber: '0123456789', bankCode: '058', nickname: 'Chidi — GTBank' },
    { name: 'Meridian Savings', accountNumber: '9010000002', bankCode: '000', nickname: 'Own savings' },
  ];
  for (const beneficiary of beneficiaries) {
    await prisma.beneficiary.upsert({
      where: {
        userId_accountNumber_bankCode: {
          userId: demoUser.id,
          accountNumber: beneficiary.accountNumber,
          bankCode: beneficiary.bankCode,
        },
      },
      update: {},
      create: {
        ...beneficiary,
        userId: demoUser.id,
        type: 'NIP',
        isFavorite: true,
        updatedAt: new Date(),
      },
    });
  }

  const notifications = [
    { type: 'DEPOSIT' as const, title: 'Salary received', body: 'NGN 150,000.00 was credited to your current account.' },
    { type: 'TRANSFER_RECEIVED' as const, title: 'Money received', body: 'Tunde Bakare sent you NGN 60,000.00.' },
  ];
  for (const notification of notifications) {
    const existing = await prisma.notification.findFirst({
      where: { userId: demoUser.id, title: notification.title },
      select: { id: true },
    });
    if (!existing) {
      await prisma.notification.create({ data: { ...notification, userId: demoUser.id } });
    }
  }

  const summary = await prisma.account.findMany({
    where: { userId: { not: null } },
    include: { balance: true, user: { select: { email: true } } },
    orderBy: { accountNumber: 'asc' },
  });

  console.log('\nSeed complete.');
  console.log(`  users: ${users.length}, new journals posted: ${posted}`);
  for (const account of summary) {
    const minor = account.balance?.balanceMinor ?? 0n;
    console.log(
      `  ${account.user?.email ?? 'internal'} | ${account.accountNumber} | ${account.type} | ` +
        `NGN ${(Number(minor) / 100).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`,
    );
  }
  console.log(`\n  Sign in with demo@meridian.ng / ${DEMO_PASSWORD}\n`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pg.onModuleDestroy();
    await prisma.$disconnect();
  });
