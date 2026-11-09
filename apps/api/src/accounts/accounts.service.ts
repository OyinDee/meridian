import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { AppConfig } from '../config/app-config.service.js';
import { bankDate } from '../common/bank-date.js';
import type { HistoryQuery } from './accounts.controller.js';

export interface AccountView {
  readonly id: string;
  readonly accountNumber: string;
  readonly type: string;
  readonly nickname: string | null;
  readonly currency: string;
  readonly status: string;
  readonly balanceMinor: string;
  readonly availableMinor: string;
  readonly holdsMinor: string;
}

export interface TransactionView {
  readonly id: string;
  readonly journalId: string;
  readonly reference: string;
  readonly kind: string;
  readonly direction: 'IN' | 'OUT';
  readonly amountMinor: string;
  readonly balanceAfterMinor: string;
  readonly currency: string;
  readonly narration: string;
  readonly counterparty: string | null;
  readonly valueDate: string;
  readonly bookedAt: string;
}

export interface HistoryPage {
  readonly items: readonly TransactionView[];
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
}

/**
 * Read models for the customer app.
 *
 * Everything here is derived from the ledger (`ledger_entries` joined to their
 * journal), never from a separate "transactions" table, so what the customer sees
 * is exactly what the bank booked. The counterparty is the other leg of the same
 * journal, which is how an internal transfer shows a real name.
 */
@Injectable()
export class AccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
  ) {}

  async list(userId: string): Promise<{ accounts: readonly AccountView[] }> {
    const accounts = await this.prisma.account.findMany({
      where: { userId, status: { not: 'CLOSED' } },
      include: { balance: true },
      orderBy: [{ type: 'asc' }, { openedAt: 'asc' }],
    });

    return {
      accounts: accounts.map((account) => ({
        id: account.id,
        accountNumber: account.accountNumber,
        type: account.type,
        nickname: account.nickname,
        currency: account.currency,
        status: account.status,
        balanceMinor: (account.balance?.balanceMinor ?? 0n).toString(),
        availableMinor: (account.balance?.availableMinor ?? 0n).toString(),
        holdsMinor: (account.balance?.holdsMinor ?? 0n).toString(),
      })),
    };
  }

  async summary(userId: string): Promise<{
    totalMinor: string;
    currency: string;
    monthInMinor: string;
    monthOutMinor: string;
    spendByCategory: readonly { category: string; amountMinor: string }[];
    accountCount: number;
  }> {
    const accounts = await this.prisma.account.findMany({
      where: { userId, status: { not: 'CLOSED' } },
      include: { balance: true },
    });
    const accountIds = accounts.map((account) => account.id);
    const totalMinor = accounts.reduce((sum, account) => sum + (account.balance?.balanceMinor ?? 0n), 0n);

    const monthStart = bankDate(new Date(), this.config.timezone);
    const entries = await this.prisma.ledgerEntry.findMany({
      where: { accountId: { in: accountIds }, valueDate: { gte: monthStart } },
      select: { direction: true, amountMinor: true, journalTransaction: { select: { kind: true } } },
    });

    let monthInMinor = 0n;
    let monthOutMinor = 0n;
    const byCategory = new Map<string, bigint>();

    for (const entry of entries) {
      if (entry.direction === 'CREDIT') {
        monthInMinor += entry.amountMinor;
        continue;
      }
      monthOutMinor += entry.amountMinor;
      const category = categoryOf(entry.journalTransaction.kind);
      byCategory.set(category, (byCategory.get(category) ?? 0n) + entry.amountMinor);
    }

    return {
      totalMinor: totalMinor.toString(),
      currency: this.config.homeCurrency,
      monthInMinor: monthInMinor.toString(),
      monthOutMinor: monthOutMinor.toString(),
      spendByCategory: [...byCategory.entries()]
        .map(([category, amountMinor]) => ({ category, amountMinor: amountMinor.toString() }))
        .sort((a, b) => (BigInt(b.amountMinor) > BigInt(a.amountMinor) ? 1 : -1)),
      accountCount: accounts.length,
    };
  }

  async history(userId: string, query: HistoryQuery): Promise<HistoryPage> {
    const owned = await this.prisma.account.findMany({
      where: { userId, ...(query.accountId ? { id: query.accountId } : {}) },
      select: { id: true },
    });
    const accountIds = owned.map((account) => account.id);
    if (accountIds.length === 0) return { items: [], nextCursor: null, hasMore: false };

    const entries = await this.prisma.ledgerEntry.findMany({
      where: {
        accountId: { in: accountIds },
        ...(query.direction ? { direction: query.direction === 'IN' ? 'CREDIT' : 'DEBIT' } : {}),
        ...(query.cursor ? { sequence: { lt: BigInt(query.cursor) } } : {}),
        ...(query.search
          ? {
              OR: [
                { narration: { contains: query.search, mode: 'insensitive' } },
                { journalTransaction: { narrative: { contains: query.search, mode: 'insensitive' } } },
              ],
            }
          : {}),
      },
      include: {
        journalTransaction: {
          include: {
            entries: {
              where: { accountId: { notIn: accountIds } },
              include: { account: { select: { userId: true, nickname: true, accountNumber: true, user: { select: { firstName: true, lastName: true } } } } },
              take: 1,
            },
          },
        },
      },
      orderBy: { sequence: 'desc' },
      take: query.limit + 1,
    });

    const page = entries.slice(0, query.limit);
    const last = page.at(-1);

    return {
      items: page.map((entry) => {
        const other = entry.journalTransaction.entries[0]?.account;
        const counterparty = other?.user
          ? `${other.user.firstName} ${other.user.lastName}`
          : other?.nickname ?? null;

        return {
          id: entry.id.toString(),
          journalId: entry.journalTransactionId,
          reference: entry.journalTransaction.reference,
          kind: entry.journalTransaction.kind,
          direction: entry.direction === 'CREDIT' ? 'IN' : 'OUT',
          amountMinor: entry.amountMinor.toString(),
          balanceAfterMinor: entry.balanceAfterMinor.toString(),
          currency: entry.currency,
          narration: entry.narration ?? entry.journalTransaction.narrative,
          counterparty,
          valueDate: entry.valueDate.toISOString().slice(0, 10),
          bookedAt: entry.createdAt.toISOString(),
        } satisfies TransactionView;
      }),
      nextCursor: entries.length > query.limit && last ? last.sequence.toString() : null,
      hasMore: entries.length > query.limit,
    };
  }

  /**
   * On-us name enquiry. Off-us accounts resolve through the NIP rails in a real
   * deployment; here we only confirm accounts that live in this bank.
   */
  async lookup(accountNumber: string): Promise<{ found: boolean; name: string | null; bank: string }> {
    if (!/^\d{10}$/.test(accountNumber)) return { found: false, name: null, bank: 'Unknown' };
    const account = await this.prisma.account.findUnique({
      where: { accountNumber },
      include: { user: { select: { firstName: true, lastName: true } } },
    });
    if (!account || !account.user) return { found: false, name: null, bank: 'External bank' };
    return {
      found: true,
      name: `${account.user.firstName} ${account.user.lastName}`,
      bank: 'Meridian Bank',
    };
  }
}

function categoryOf(kind: string): string {
  switch (kind) {
    case 'INTERNAL_TRANSFER':
    case 'EXTERNAL_TRANSFER':
      return 'Transfers';
    case 'WITHDRAWAL':
    case 'CARD_AUTHORIZATION':
    case 'CARD_CAPTURE':
      return 'Cash & cards';
    case 'FEE':
      return 'Fees';
    case 'LOAN_REPAYMENT':
      return 'Loans';
    case 'FX_CONVERSION':
      return 'FX';
    default:
      return 'Other';
  }
}
