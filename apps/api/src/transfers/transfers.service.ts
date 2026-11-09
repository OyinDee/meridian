import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { transferSchema, type TransferRequest } from '@meridian/contracts';
import { PrismaService } from '../prisma/prisma.service.js';
import { PostingService } from '../ledger/posting.service.js';
import {
  AccountNotActiveError,
  AccountNotFoundError,
  BeneficiaryNotFoundError,
  ConflictError,
  DomainError,
  NotFoundError,
  SelfTransferError,
  ValidationFailedError,
} from '../common/errors.js';

export interface TransferView {
  readonly id: string;
  readonly reference: string;
  readonly status: string;
  readonly channel: string;
  readonly amountMinor: string;
  readonly feeMinor: string;
  readonly currency: string;
  readonly narration: string;
  readonly toAccountName: string | null;
  readonly toAccountNumber: string | null;
  readonly toBankCode: string | null;
  readonly fromAccountId: string;
  readonly createdAt: string;
  readonly settledAt: string | null;
}

/**
 * Customer-initiated payments.
 *
 * The transfer row is the business intent; the money moves only through
 * PostingService, inside the same database transaction, so a transfer can never
 * exist as SETTLED without a balanced journal behind it. On-us transfers (both
 * accounts belong to Meridian) credit the destination immediately; off-us
 * transfers debit the customer and credit the bank's settlement account.
 */
@Injectable()
export class TransfersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly posting: PostingService,
  ) {}

  async create(
    userId: string,
    input: TransferRequest,
    idempotencyKey: string | undefined,
  ): Promise<TransferView> {
    const parsed = transferSchema.parse(input);
    const source = await this.prisma.account.findUnique({ where: { id: parsed.fromAccountId } });
    if (!source || source.userId !== userId) throw new AccountNotFoundError(parsed.fromAccountId);
    if (source.status !== 'ACTIVE') throw new AccountNotActiveError(source.status);

    const amountMinor = parseAmountMinor(parsed.amount, source.currency);
    const narration = parsed.narration?.trim() || 'Transfer';

    let destination: { id: string; accountNumber: string; name: string; bankCode: string } | null = null;
    let beneficiaryId: string | null = null;

    if (parsed.beneficiaryId) {
      const beneficiary = await this.prisma.beneficiary.findUnique({ where: { id: parsed.beneficiaryId } });
      if (!beneficiary || beneficiary.userId !== userId) throw new BeneficiaryNotFoundError(parsed.beneficiaryId);
      beneficiaryId = beneficiary.id;
      destination = await this.resolveDestination(beneficiary.accountNumber, beneficiary.bankCode);
    } else if (parsed.toAccountNumber && parsed.toBankCode) {
      destination = await this.resolveDestination(parsed.toAccountNumber, parsed.toBankCode);
    } else {
      throw new ValidationFailedError('Choose a beneficiary or enter an account number and bank.');
    }

    if (destination?.id === source.id) throw new SelfTransferError();

    const key = idempotencyKey ?? `web:${randomUUID()}`;
    const existing = await this.prisma.transfer.findUnique({ where: { idempotencyKey: key } });
    if (existing) return toView(existing);

    const settlementAccount = destination
      ? null
      : await this.prisma.account.findUnique({ where: { accountNumber: '1000000001' } });
    if (!destination && !settlementAccount) {
      throw new ConflictError('SETTLEMENT_ACCOUNT_MISSING', 'The bank settlement account is not configured.');
    }

    const reference = `TRF-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 6).toUpperCase()}`;

    // The intent row is written first, outside the money transaction: the posting
    // engine opens its own REPEATABLE READ transaction and takes the ledger chain
    // lock, and nesting that inside a Prisma interactive transaction would hold two
    // connections and risk the 5s interactive timeout under Neon latency.
    const created = await this.prisma.transfer.create({
      data: {
        reference,
        channel: destination ? 'INTERNAL' : 'NIP',
        status: 'PROCESSING',
        fromAccountId: source.id,
        toAccountId: destination?.id ?? null,
        beneficiaryId,
        toAccountNumber: destination?.accountNumber ?? parsed.toAccountNumber ?? null,
        toBankCode: destination?.bankCode ?? parsed.toBankCode ?? null,
        toAccountName: destination?.name ?? null,
        amountMinor,
        currency: source.currency,
        narration,
        initiatedByUserId: userId,
        idempotencyKey: key,
        riskDecision: 'ALLOW',
        updatedAt: new Date(),
      },
    });

    let journal: { id: string };
    try {
      journal = await this.posting.post(
        {
          kind: destination ? 'INTERNAL_TRANSFER' : 'EXTERNAL_TRANSFER',
          currency: source.currency as never,
          narrative: narration,
          reference: `J-${reference}`,
          idempotencyKey: `transfer:${created.id}`,
          initiatedByUserId: userId,
          legs: [
            { accountId: source.id, direction: 'DEBIT', amountMinor, narration },
            {
              accountId: destination?.id ?? settlementAccount!.id,
              direction: 'CREDIT',
              amountMinor,
              narration: destination ? `From ${source.nickname ?? source.accountNumber}` : narration,
            },
          ],
        },
        { label: `transfer:${created.id}` },
      );
    } catch (error) {
      // No money moved, so the intent is marked failed rather than left PROCESSING.
      await this.prisma.transfer.update({
        where: { id: created.id },
        data: {
          status: 'FAILED',
          failureCode: error instanceof DomainError ? error.code : 'POSTING_FAILED',
          failureReason: error instanceof Error ? error.message : 'Posting failed',
          updatedAt: new Date(),
        },
      });
      throw error;
    }

    const [settled] = await this.prisma.$transaction([
      this.prisma.transfer.update({
        where: { id: created.id },
        data: {
          status: 'SETTLED',
          journalTransactionId: journal.id,
          settledAt: new Date(),
          updatedAt: new Date(),
        },
      }),
      this.prisma.transferEvent.create({
        data: { transferId: created.id, fromStatus: 'PROCESSING', toStatus: 'SETTLED', reason: 'Posted to the ledger' },
      }),
      this.prisma.notification.create({
        data: {
          userId,
          type: 'TRANSFER_SENT',
          title: 'Transfer sent',
          body: `${formatMinor(amountMinor, source.currency)} to ${destination?.name ?? parsed.toAccountNumber} was successful.`,
          metadata: { transferId: created.id, reference },
        },
      }),
      this.prisma.beneficiary.updateMany({
        where: { userId, accountNumber: destination?.accountNumber ?? parsed.toAccountNumber ?? '' },
        data: { lastUsedAt: new Date() },
      }),
    ]);

    return toView(settled);
  }

  async list(userId: string, limit = 20): Promise<{ transfers: readonly TransferView[] }> {
    const transfers = await this.prisma.transfer.findMany({
      where: { initiatedByUserId: userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return { transfers: transfers.map(toView) };
  }

  async get(userId: string, id: string): Promise<TransferView> {
    const transfer = await this.prisma.transfer.findUnique({ where: { id } });
    if (!transfer || transfer.initiatedByUserId !== userId) throw new NotFoundError('TRANSFER_NOT_FOUND', 'Transfer not found.');
    return toView(transfer);
  }

  /**
   * Resolve where the money lands. An on-us account number is looked up directly;
   * anything else is treated as an off-us NIP payment to the bank's settlement
   * account, with the destination details kept on the transfer for the rails.
   */
  private async resolveDestination(
    accountNumber: string,
    bankCode: string,
  ): Promise<{ id: string; accountNumber: string; name: string; bankCode: string } | null> {
    const onUs = await this.prisma.account.findUnique({
      where: { accountNumber },
      include: { user: { select: { firstName: true, lastName: true } } },
    });

    if (onUs && onUs.userId) {
      if (onUs.status !== 'ACTIVE') throw new AccountNotActiveError(onUs.status);
      return {
        id: onUs.id,
        accountNumber: onUs.accountNumber,
        name: onUs.user ? `${onUs.user.firstName} ${onUs.user.lastName}` : onUs.nickname ?? accountNumber,
        bankCode: '000',
      };
    }

    if (bankCode === '000') {
      throw new AccountNotFoundError(accountNumber);
    }

    return null;
  }
}

function parseAmountMinor(amount: string, currency: string): bigint {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(amount.trim());
  if (!match) throw new ValidationFailedError('Enter an amount like 2500 or 2500.50.');
  const whole = BigInt(match[1] ?? '0');
  const fraction = BigInt((match[2] ?? '').padEnd(2, '0'));
  const minor = whole * 100n + fraction;
  if (minor <= 0n) throw new ValidationFailedError('Enter an amount greater than zero.');
  if (currency !== 'NGN') throw new ValidationFailedError('Only NGN transfers are supported.');
  return minor;
}

function formatMinor(minor: bigint, currency: string): string {
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency }).format(Number(minor) / 100);
}

function toView(transfer: Prisma.TransferGetPayload<object>): TransferView {
  return {
    id: transfer.id,
    reference: transfer.reference,
    status: transfer.status,
    channel: transfer.channel,
    amountMinor: transfer.amountMinor.toString(),
    feeMinor: transfer.feeMinor.toString(),
    currency: transfer.currency,
    narration: transfer.narration,
    toAccountName: transfer.toAccountName,
    toAccountNumber: transfer.toAccountNumber,
    toBankCode: transfer.toBankCode,
    fromAccountId: transfer.fromAccountId,
    createdAt: transfer.createdAt.toISOString(),
    settledAt: transfer.settledAt?.toISOString() ?? null,
  };
}
