import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { PoolClient, QueryResultRow } from 'pg';
import { PgService } from '../database/pg.service.js';
import { AppConfig } from '../config/app-config.service.js';
import {
  AccountNotActiveError,
  AccountNotFoundError,
  ConflictError,
  CurrencyMismatchError,
  InsufficientFundsError,
  ValidationFailedError,
} from '../common/errors.js';
import { isoBankDate } from '../common/bank-date.js';
import { CHAIN_LOCK_KEY, hashJournal, journalReference, journalTotals, signedDelta } from './ledger.hasher.js';
import type {
  LockedAccountState,
  PostJournalInput,
  PostedJournal,
  PostedLeg,
  PostingLeg,
} from './ledger.types.js';

/** One `accounts` row joined with its cached balance, locked for the posting. */
interface LockedAccountRow extends QueryResultRow {
  id: string;
  account_number: string;
  status: string;
  currency: string;
  normal_balance: 'DEBIT' | 'CREDIT';
  allow_overdraft: boolean;
  overdraft_limit_minor: string;
  minimum_balance_minor: string;
  balance_minor: string | null;
  available_minor: string | null;
  holds_minor: string | null;
  version: number | null;
}

interface JournalRow extends QueryResultRow {
  sequence: string;
}

interface EntryRow extends QueryResultRow {
  id: string;
  sequence: string;
}

export interface PostJournalOptions {
  /** Post inside a caller's transaction (transfers, deposits, seed data). */
  readonly client?: PoolClient;
  readonly label?: string;
}

/**
 * The posting engine.
 *
 * Every balance change in the bank goes through `post()`. It is the only code that
 * writes `journal_transactions` and `ledger_entries`, and each of its invariants is
 * also enforced by the database, so application code is never the last line of
 * defence:
 *
 *   1. A journal balances: sum(debits) == sum(credits), and the header agrees with
 *      its legs. The deferred `ledger_entries_balanced` constraint trigger checks
 *      this at COMMIT, so a half-written journal is never visible to anyone.
 *   2. Accounts are locked in `id` order with `SELECT ... FOR UPDATE`. Two
 *      concurrent transfers touching the same pair of accounts acquire locks in the
 *      same order, so they queue instead of deadlocking.
 *   3. The hash chain is appended under a transaction-scoped advisory lock. The
 *      chain is the tamper evidence, so two writers must not both read the same
 *      "previous hash" and fork it.
 *   4. `balance_after_minor` on every leg is computed before the INSERT, because
 *      `ledger_entries` is append-only and cannot be corrected afterwards.
 *   5. The materialised balance is updated in the same transaction as the entries
 *      that justify it, which is why `meridian.reconciliation_report()` stays empty.
 *
 * Money is integer minor units end to end, never a float. `amountMinor` is always a
 * positive magnitude and `direction` carries the sign, so a negative amount is
 * unrepresentable.
 */
@Injectable()
export class PostingService {
  constructor(
    private readonly pg: PgService,
    private readonly config: AppConfig,
  ) {}

  async post(input: PostJournalInput, options: PostJournalOptions = {}): Promise<PostedJournal> {
    const prepared = this.prepare(input);

    if (options.client) {
      return this.execute(options.client, prepared);
    }

    // REPEATABLE READ plus ordered row locks. A serialization failure here is a real
    // conflict, and PgService retries it with jittered exponential backoff.
    return this.pg.transaction((client) => this.execute(client, prepared), {
      label: options.label ?? `post:${prepared.kind}`,
    });
  }

  // --------------------------------------------------------------- validation

  /**
   * Pure checks that run before a connection is taken: shape, magnitudes and where
   * the debits and credits disagree. The database re-checks all of it, but failing
   * here produces a precise domain error instead of a constraint violation.
   */
  private prepare(input: PostJournalInput): PostJournalInput & { amountMinor: bigint } {
    if (input.legs.length < 2) {
      throw new ValidationFailedError('A journal needs at least two legs.', {
        legCount: input.legs.length,
      });
    }

    for (const leg of input.legs) {
      if (leg.amountMinor <= 0n) {
        throw new ValidationFailedError('Every leg amount must be greater than zero.', {
          accountId: leg.accountId,
          amountMinor: leg.amountMinor.toString(),
        });
      }
    }

    const totals = journalTotals(input.legs);
    if (totals.imbalanceMinor !== 0n) {
      throw new ValidationFailedError(
        'Journal does not balance: debits and credits differ.',
        {
          debitTotal: totals.debitTotal.toString(),
          creditTotal: totals.creditTotal.toString(),
          imbalanceMinor: totals.imbalanceMinor.toString(),
        },
      );
    }

    return { ...input, amountMinor: totals.debitTotal, legs: [...input.legs] };
  }

  // ---------------------------------------------------------------- execution

  private async execute(
    client: PoolClient,
    input: PostJournalInput & { amountMinor: bigint },
  ): Promise<PostedJournal> {
    const bookedAt = input.bookedAt ?? new Date();
    const valueDate = input.valueDate ?? bookedAt;

    // Serialise chain appends; the lock is released when the transaction ends.
    await client.query('SELECT pg_advisory_xact_lock($1)', [CHAIN_LOCK_KEY.toString()]);

    const locked = await this.lockAccounts(client, input);
    this.assertAccountsUsable(locked, input);
    this.assertFundsAvailable(locked, input);

    const { rows: prevRows } = await client.query<{ hash: string }>(
      'SELECT hash FROM journal_transactions ORDER BY sequence DESC LIMIT 1',
    );
    const prevHash = prevRows[0]?.hash ?? null;

    const journalId = randomUUID();
    const reference =
      input.reference ?? journalReference(input.kind, bookedAt, this.config.timezone);

    const hash = hashJournal({
      journalId,
      reference,
      kind: input.kind,
      currency: input.currency,
      valueDate,
      bookedAt,
      amountMinor: input.amountMinor,
      entryCount: input.legs.length,
      initiatedByUserId: input.initiatedByUserId,
      loanId: input.loanId,
      legs: input.legs,
      prevHash,
    });

    const sequence = await this.insertJournal(client, {
      journalId,
      reference,
      input,
      bookedAt,
      valueDate,
      hash,
      prevHash,
    });

    const legs = await this.insertEntries(client, journalId, input, valueDate, locked);
    await this.applyBalanceUpdates(client, locked, input, legs);
    await this.enqueueEvents(client, journalId, sequence, input, reference, bookedAt);

    return {
      id: journalId,
      sequence,
      reference,
      kind: input.kind,
      currency: input.currency,
      amountMinor: input.amountMinor,
      entryCount: input.legs.length,
      valueDate,
      bookedAt,
      hash,
      hashPrev: prevHash,
      legs,
      idempotentReplay: false,
    };
  }

  /**
   * Lock the accounts and their cached balances in `id` order.
   *
   * Two statements because `FOR UPDATE` cannot lock the nullable side of a LEFT
   * JOIN. Both are ordered by the same key, which is what makes it deadlock-free.
   */
  private async lockAccounts(
    client: PoolClient,
    input: PostJournalInput,
  ): Promise<Map<string, LockedAccountState>> {
    const accountIds = [...new Set(input.legs.map((leg) => leg.accountId))];

    const { rows } = await client.query<LockedAccountRow>(
      `SELECT a.id,
              a.account_number,
              a.status::text         AS status,
              a.currency,
              a.normal_balance::text AS normal_balance,
              a.allow_overdraft,
              a.overdraft_limit_minor::text AS overdraft_limit_minor,
              a.minimum_balance_minor::text AS minimum_balance_minor,
              b.balance_minor::text   AS balance_minor,
              b.available_minor::text AS available_minor,
              b.holds_minor::text     AS holds_minor,
              b.version               AS version
         FROM accounts a
         LEFT JOIN account_balances b ON b.account_id = a.id
        WHERE a.id = ANY($1::uuid[])
        ORDER BY a.id
          FOR UPDATE OF a`,
      [accountIds],
    );

    if (rows.length !== accountIds.length) {
      const found = new Set(rows.map((row) => row.id));
      throw new AccountNotFoundError(accountIds.find((id) => !found.has(id)) ?? 'unknown');
    }

    await client.query(
      `SELECT account_id
         FROM account_balances
        WHERE account_id = ANY($1::uuid[])
        ORDER BY account_id
          FOR UPDATE`,
      [accountIds],
    );

    return new Map(
      rows.map((row) => [
        row.id,
        {
          accountId: row.id,
          accountNumber: row.account_number,
          status: row.status,
          currency: row.currency,
          normalBalance: row.normal_balance,
          allowOverdraft: row.allow_overdraft,
          overdraftLimitMinor: BigInt(row.overdraft_limit_minor),
          minimumBalanceMinor: BigInt(row.minimum_balance_minor),
          balanceMinor: BigInt(row.balance_minor ?? '0'),
          availableMinor: BigInt(row.available_minor ?? '0'),
          holdsMinor: BigInt(row.holds_minor ?? '0'),
          version: row.version ?? 0,
        } satisfies LockedAccountState,
      ]),
    );
  }

  private assertAccountsUsable(
    locked: Map<string, LockedAccountState>,
    input: PostJournalInput,
  ): void {
    for (const account of locked.values()) {
      if (account.status !== 'ACTIVE') {
        throw new AccountNotActiveError(account.status);
      }
      if (account.currency !== input.currency) {
        throw new CurrencyMismatchError(account.currency, input.currency);
      }
    }
  }

  /**
   * Funds check for the accounts this journal reduces.
   *
   * Spendable amount is the cached available balance (balance minus active holds).
   * The floor is the overdraft limit when the product allows one, otherwise the
   * account's own minimum balance. Accounts being credited are never checked, so
   * receiving money cannot fail on this rule.
   */
  private assertFundsAvailable(
    locked: Map<string, LockedAccountState>,
    input: PostJournalInput,
  ): void {
    for (const [accountId, delta] of this.deltasByAccount(locked, input.legs)) {
      if (delta >= 0n) continue;

      const account = locked.get(accountId);
      if (!account) continue;

      const floorMinor = account.allowOverdraft
        ? -account.overdraftLimitMinor
        : account.minimumBalanceMinor;

      if (account.availableMinor + delta < floorMinor) {
        throw new InsufficientFundsError(account.availableMinor, -delta, account.currency);
      }
    }
  }

  /** Net signed effect of this journal per account, in that account's normal direction. */
  private deltasByAccount(
    locked: Map<string, LockedAccountState>,
    legs: readonly PostingLeg[],
  ): Map<string, bigint> {
    const deltas = new Map<string, bigint>();
    for (const leg of legs) {
      const account = locked.get(leg.accountId);
      if (!account) continue;
      const delta = signedDelta(account.normalBalance, leg.direction, leg.amountMinor);
      deltas.set(leg.accountId, (deltas.get(leg.accountId) ?? 0n) + delta);
    }
    return deltas;
  }

  // ------------------------------------------------------------------ writes

  private async insertJournal(
    client: PoolClient,
    args: {
      journalId: string;
      reference: string;
      input: PostJournalInput & { amountMinor: bigint };
      bookedAt: Date;
      valueDate: Date;
      hash: string;
      prevHash: string | null;
    },
  ): Promise<bigint> {
    const { journalId, reference, input, bookedAt, valueDate, hash, prevHash } = args;

    const { rows } = await client.query<JournalRow>(
      `INSERT INTO journal_transactions
         (id, reference, kind, status, currency, amount_minor, entry_count, narrative,
          value_date, booked_at, idempotency_key, initiated_by_user_id, loan_id,
          hash_prev, hash, hash_algo)
       VALUES ($1, $2, $3::"JournalKind", 'POSTED', $4, $5, $6, $7,
               $8::date, $9, $10, $11, $12, $13, $14, 'sha256:v1')
       RETURNING sequence::text AS sequence`,
      [
        journalId,
        reference,
        input.kind,
        input.currency,
        input.amountMinor.toString(),
        input.legs.length,
        input.narrative,
        isoBankDate(valueDate, this.config.timezone),
        bookedAt,
        input.idempotencyKey ?? null,
        input.initiatedByUserId ?? null,
        input.loanId ?? null,
        prevHash,
        hash,
      ],
    );

    const sequence = rows[0]?.sequence;
    if (!sequence) {
      throw new ConflictError('JOURNAL_WRITE_FAILED', 'The journal header could not be written.');
    }
    return BigInt(sequence);
  }

  /**
   * Write the legs with their running balance, carried forward in the order given.
   *
   * The running balance starts from the balance read under lock, so
   * `balance_after_minor` is a fact at INSERT time: statements can be read straight
   * out of the ledger without replaying history, and the append-only trigger is
   * never worked around.
   */
  private async insertEntries(
    client: PoolClient,
    journalId: string,
    input: PostJournalInput,
    valueDate: Date,
    locked: Map<string, LockedAccountState>,
  ): Promise<PostedLeg[]> {
    const running = new Map<string, bigint>(
      [...locked.values()].map((account) => [account.accountId, account.balanceMinor]),
    );
    const posted: PostedLeg[] = [];

    for (const leg of input.legs) {
      const account = locked.get(leg.accountId);
      if (!account) throw new AccountNotFoundError(leg.accountId);

      const balanceAfter =
        (running.get(leg.accountId) ?? 0n) +
        signedDelta(account.normalBalance, leg.direction, leg.amountMinor);
      running.set(leg.accountId, balanceAfter);

      const { rows } = await client.query<EntryRow>(
        `INSERT INTO ledger_entries
           (journal_transaction_id, account_id, direction, amount_minor, currency,
            balance_after_minor, narration, value_date)
         VALUES ($1, $2, $3::"LedgerDirection", $4, $5, $6, $7, $8::date)
         RETURNING id::text AS id, sequence::text AS sequence`,
        [
          journalId,
          leg.accountId,
          leg.direction,
          leg.amountMinor.toString(),
          input.currency,
          balanceAfter.toString(),
          leg.narration ?? input.narrative,
          isoBankDate(valueDate, this.config.timezone),
        ],
      );

      const row = rows[0];
      if (!row) {
        throw new ConflictError('LEDGER_WRITE_FAILED', 'A ledger entry could not be written.');
      }

      posted.push({
        entryId: BigInt(row.id),
        entrySequence: BigInt(row.sequence),
        accountId: leg.accountId,
        direction: leg.direction,
        amountMinor: leg.amountMinor,
        balanceAfterMinor: balanceAfter,
      });
    }

    return posted;
  }

  private async applyBalanceUpdates(
    client: PoolClient,
    locked: Map<string, LockedAccountState>,
    input: PostJournalInput,
    legs: readonly PostedLeg[],
  ): Promise<void> {
    const legCounts = new Map<string, bigint>();
    for (const leg of legs) {
      legCounts.set(leg.accountId, (legCounts.get(leg.accountId) ?? 0n) + 1n);
    }

    for (const [accountId, delta] of this.deltasByAccount(locked, input.legs)) {
      await client.query(
        `UPDATE account_balances
            SET balance_minor   = balance_minor + $2,
                available_minor = available_minor + $2,
                entry_count     = entry_count + $3,
                last_entry_id   = $4,
                version         = version + 1,
                updated_at      = now()
          WHERE account_id = $1`,
        [
          accountId,
          delta.toString(),
          (legCounts.get(accountId) ?? 0n).toString(),
          lastEntryId(legs, accountId),
        ],
      );
    }
  }

  /**
   * Enqueue the notification inside the same transaction as the money.
   *
   * This is the transactional outbox: an event cannot be lost by a crash between
   * the ledger write and the push, because they commit or roll back together.
   */
  private async enqueueEvents(
    client: PoolClient,
    journalId: string,
    sequence: bigint,
    input: PostJournalInput & { amountMinor: bigint },
    reference: string,
    bookedAt: Date,
  ): Promise<void> {
    const payload = {
      journalId,
      reference,
      sequence: sequence.toString(),
      kind: input.kind,
      currency: input.currency,
      amountMinor: input.amountMinor.toString(),
      narrative: input.narrative,
      bookedAt: bookedAt.toISOString(),
    };
    const encoded = JSON.stringify(payload);

    await client.query(
      `INSERT INTO outbox_events (type, aggregate_type, aggregate_id, user_id, payload)
       VALUES ('transaction.posted', 'journal_transaction', $1, $2, $3::jsonb)`,
      [journalId, input.initiatedByUserId ?? null, encoded],
    );

    if (input.initiatedByUserId) {
      await client.query(
        `INSERT INTO realtime_events (user_id, type, payload)
         VALUES ($1, 'transaction.posted', $2::jsonb)`,
        [input.initiatedByUserId, encoded],
      );
    }
  }
}

function lastEntryId(legs: readonly PostedLeg[], accountId: string): string | null {
  for (let index = legs.length - 1; index >= 0; index -= 1) {
    const leg = legs[index];
    if (leg && leg.accountId === accountId) return leg.entryId.toString();
  }
  return null;
}
