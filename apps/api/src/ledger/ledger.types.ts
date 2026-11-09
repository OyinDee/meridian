import type { JournalKind, LedgerDirection } from '@meridian/contracts';
import type { CurrencyCode } from '@meridian/money';

/**
 * A single leg of a journal transaction. `amountMinor` is always a positive
 * magnitude; `direction` carries the sign. That is deliberate: a negative amount is
 * meaningless in double-entry, and making it unrepresentable removes a whole class
 * of posting bugs.
 */

export interface PostingLeg {
  readonly accountId: string;
  readonly direction: LedgerDirection;
  readonly amountMinor: bigint;
  readonly narration?: string;
}

export interface PostJournalInput {
  readonly kind: JournalKind;
  readonly currency: CurrencyCode;
  readonly legs: readonly PostingLeg[];
  readonly narrative: string;
  readonly valueDate?: Date;
  readonly reference?: string;
  readonly idempotencyKey?: string;
  readonly initiatedByUserId?: string;
  readonly loanId?: string;
  readonly bookedAt?: Date;
}

export interface PostedLeg {
  readonly entryId: bigint;
  readonly entrySequence: bigint;
  readonly accountId: string;
  readonly direction: LedgerDirection;
  readonly amountMinor: bigint;
  readonly balanceAfterMinor: bigint;
}

export interface PostedJournal {
  readonly id: string;
  readonly sequence: bigint;
  readonly reference: string;
  readonly kind: JournalKind;
  readonly currency: CurrencyCode;
  readonly amountMinor: bigint;
  readonly entryCount: number;
  readonly valueDate: Date;
  readonly bookedAt: Date;
  readonly hash: string;
  readonly hashPrev: string | null;
  readonly legs: readonly PostedLeg[];
  /** True when an idempotency key matched an earlier posting, so nothing was written. */
  readonly idempotentReplay: boolean;
}

/** Everything the posting engine needs about an account while holding its lock. */
export interface LockedAccountState {
  readonly accountId: string;
  readonly accountNumber: string;
  readonly status: string;
  readonly currency: string;
  readonly normalBalance: LedgerDirection;
  readonly allowOverdraft: boolean;
  readonly overdraftLimitMinor: bigint;
  readonly minimumBalanceMinor: bigint;
  readonly balanceMinor: bigint;
  readonly availableMinor: bigint;
  readonly holdsMinor: bigint;
  readonly version: number;
}
