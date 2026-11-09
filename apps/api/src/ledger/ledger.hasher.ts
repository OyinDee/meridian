import { createHash, randomBytes } from 'node:crypto';
import type { JournalKind } from '@meridian/contracts';
import { businessReference } from '../common/bank-date.js';
import type { PostJournalInput, PostingLeg } from './ledger.types.js';

/**
 * Tamper evidence for the ledger.
 *
 * Every journal row stores a SHA-256 hash over a canonical rendering of its own
 * content plus the hash of the journal before it, which turns the ledger into a hash
 * chain: altering any historical amount, account or date breaks every subsequent
 * link, and `meridian.verify_ledger_chain()` finds the first break.
 *
 * The hash deliberately excludes the database-assigned `sequence`, because the hash
 * has to be computed before the INSERT that would assign it. Ordering is carried by
 * `hash_prev` instead.
 */

export const HASH_ALGO = 'sha256:v1' as const;

/**
 * Advisory lock key that serialises chain linkage across API instances. Held for the
 * duration of the transaction, so posting throughput is bounded by one writer at a
 * time; see ADR 0006 for why that trade is accepted here and how it would be
 * sharded in production.
 */
export const CHAIN_LOCK_KEY = 8_873_110_001n;

/** Random, unambiguous suffix (Crockford base32, no I/O/1/0). */
export function randomSuffix(length = 6): string {
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  const bytes = randomBytes(length);
  let out = '';
  for (let index = 0; index < length; index += 1) {
    out += alphabet[bytes[index]! % alphabet.length];
  }
  return out;
}

const REFERENCE_KIND: Record<JournalKind, string> = {
  DEPOSIT: 'DEP',
  WITHDRAWAL: 'WDR',
  INTERNAL_TRANSFER: 'TRF',
  EXTERNAL_TRANSFER: 'NIP',
  FEE: 'FEE',
  INTEREST_ACCRUAL: 'IAC',
  INTEREST_CAPITALISATION: 'ICP',
  FX_CONVERSION: 'FXC',
  LOAN_DISBURSEMENT: 'LDB',
  LOAN_REPAYMENT: 'LRP',
  CARD_AUTHORIZATION: 'CAU',
  CARD_CAPTURE: 'CCP',
  HOLD_RELEASE: 'HRL',
  SETTLEMENT: 'STL',
  REVERSAL: 'REV',
  ADJUSTMENT: 'ADJ',
  OPENING_BALANCE: 'OBL',
};

export function journalReference(kind: JournalKind, instant: Date, timezone: string): string {
  return businessReference(REFERENCE_KIND[kind] ?? 'JNL', instant, timezone, () => randomSuffix(6));
}

/** Legs in a stable order, so the same posting always produces the same hash. */
export function canonicalLegOrder(legs: readonly PostingLeg[]): PostingLeg[] {
  return [...legs].sort((a, b) => {
    if (a.accountId !== b.accountId) return a.accountId < b.accountId ? -1 : 1;
    if (a.direction !== b.direction) return a.direction < b.direction ? -1 : 1;
    if (a.amountMinor !== b.amountMinor) return a.amountMinor < b.amountMinor ? -1 : 1;
    return (a.narration ?? '').localeCompare(b.narration ?? '');
  });
}

export interface HashInput {
  readonly journalId: string;
  readonly reference: string;
  readonly kind: JournalKind;
  readonly currency: string;
  readonly valueDate: Date;
  readonly bookedAt: Date;
  readonly amountMinor: bigint;
  readonly entryCount: number;
  readonly initiatedByUserId?: string;
  readonly loanId?: string;
  readonly legs: readonly PostingLeg[];
  readonly prevHash: string | null;
}

/**
 * Canonical serialisation: a JSON array with a fixed field order, BigInts as
 * decimal strings. `JSON.stringify` on an array of primitives is deterministic, so
 * two processes hashing the same posting agree byte for byte.
 */
export function canonicalJournalPayload(input: HashInput): string {
  return JSON.stringify([
    HASH_ALGO,
    input.prevHash ?? null,
    input.journalId,
    input.reference,
    input.kind,
    input.currency,
    input.valueDate.toISOString().slice(0, 10),
    input.bookedAt.toISOString(),
    input.amountMinor.toString(),
    input.entryCount,
    input.initiatedByUserId ?? null,
    input.loanId ?? null,
    canonicalLegOrder(input.legs).map((leg) => [
      leg.accountId,
      leg.direction,
      leg.amountMinor.toString(),
      leg.narration ?? null,
    ]),
  ]);
}

export function hashJournal(input: HashInput): string {
  return createHash('sha256').update(canonicalJournalPayload(input), 'utf8').digest('hex');
}

/** Recompute a stored journal's hash to detect a row that was altered in place. */
export function hashOfStoredJournal(input: Omit<HashInput, 'legs'> & { legs: readonly PostingLeg[] }): string {
  return hashJournal(input);
}

/** Totals used by both validation and the hash. */
export function journalTotals(legs: readonly PostingLeg[]): {
  debitTotal: bigint;
  creditTotal: bigint;
  imbalanceMinor: bigint;
} {
  let debitTotal = 0n;
  let creditTotal = 0n;
  for (const leg of legs) {
    if (leg.direction === 'DEBIT') debitTotal += leg.amountMinor;
    else creditTotal += leg.amountMinor;
  }
  return { debitTotal, creditTotal, imbalanceMinor: debitTotal - creditTotal };
}

/** Signed effect of a leg on an account's balance, in the account's normal direction. */
export function signedDelta(
  normalBalance: 'DEBIT' | 'CREDIT',
  direction: 'DEBIT' | 'CREDIT',
  amountMinor: bigint,
): bigint {
  return direction === normalBalance ? amountMinor : -amountMinor;
}

/** The reference a caller would get if it did not supply one (used in tests). */
export function defaultReference(input: Pick<PostJournalInput, 'kind'>, instant: Date, timezone: string): string {
  return journalReference(input.kind, instant, timezone);
}
