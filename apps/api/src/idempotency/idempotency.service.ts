import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { ConflictError, IdempotencyConflictError } from '../common/errors.js';

/**
 * Deterministic JSON: object keys are sorted at every level so the same logical
 * request always hashes to the same value, whatever order the client serialised it in.
 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entryValue]) => entryValue !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`);

  return `{${entries.join(',')}}`;
}

export interface IdempotentOutcome<T> {
  readonly replayed: boolean;
  readonly status: number;
  readonly body: T;
}

/**
 * Exactly-once semantics for mutating endpoints.
 *
 * The guarantee is implemented in the database, not in memory, so it survives a
 * restart and works across API instances:
 *
 *   * the claim is an `INSERT ... ON CONFLICT DO NOTHING` against the unique
 *     `(key, endpoint)` index, taken inside the *same* transaction as the work;
 *   * a replay of a finished request finds the claim, compares the request hash and
 *     returns the response that was stored, without touching money again;
 *   * a concurrent duplicate blocks on the unique index until the first request
 *     commits, then finds the completed row and replays it;
 *   * the same key with a *different* body is a client bug and returns 409 rather
 *     than silently applying the wrong intent.
 */
@Injectable()
export class IdempotencyService {
  hashRequest(body: unknown): string {
    return createHash('sha256').update(stableStringify(body)).digest('hex');
  }

  async run<T>(
    client: PoolClient,
    args: {
      key: string;
      endpoint: string;
      userId: string | null;
      request: unknown;
      work: () => Promise<{ status: number; body: T }>;
    },
  ): Promise<IdempotentOutcome<T>> {
    const requestHash = this.hashRequest(args.request);

    const claim = await client.query<{ id: string }>(
      `INSERT INTO idempotency_keys
         (id, key, user_id, endpoint, request_hash, response_status, response_body, expires_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, 0, '{}'::jsonb, now() + interval '1 day')
       ON CONFLICT (key, endpoint) DO NOTHING
       RETURNING id`,
      [args.key, args.userId, args.endpoint, requestHash],
    );

    if (claim.rowCount === 0) {
      const { rows } = await client.query<{
        request_hash: string;
        response_status: number;
        response_body: unknown;
      }>(
        'SELECT request_hash, response_status, response_body FROM idempotency_keys WHERE key = $1 AND endpoint = $2',
        [args.key, args.endpoint],
      );

      const stored = rows[0];
      if (!stored) {
        // Unreachable in practice: the row was inserted by another transaction that
        // has since rolled back. Treat it as in-flight rather than guessing.
        throw new ConflictError(
          'IDEMPOTENCY_IN_PROGRESS',
          'An identical request is still being processed.',
        );
      }

      if (stored.request_hash !== requestHash) {
        throw new IdempotencyConflictError(args.key);
      }

      return {
        replayed: true,
        status: stored.response_status,
        body: stored.response_body as T,
      };
    }

    const claimId = claim.rows[0]?.id;
    const result = await args.work();

    if (claimId) {
      await client.query(
        'UPDATE idempotency_keys SET response_status = $2, response_body = $3::jsonb WHERE id = $1',
        [claimId, result.status, JSON.stringify(result.body)],
      );
    }

    return { replayed: false, status: result.status, body: result.body };
  }
}
