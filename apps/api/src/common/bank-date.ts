import { DateTime } from 'luxon';
import type { LimitWindow } from '@meridian/contracts';

/**
 * Banking dates.
 *
 * A bank's day is decided by the bank's timezone, not by the server's clock. Interest
 * accrual, daily limits, value dates and statement periods all key off
 * `Africa/Lagos` even if the API is deployed in `us-east-1`, which matters because a
 * transfer at 00:30 Lagos time belongs to the new day, not to UTC's previous one.
 */

/** Start of the banking day that `instant` falls in, as a date-only Date (UTC midnight). */
export function bankDate(instant: Date, timezone: string): Date {
  const local = DateTime.fromJSDate(instant, { zone: timezone });
  return DateTime.fromObject(
    { year: local.year, month: local.month, day: local.day },
    { zone: 'utc' },
  ).toJSDate();
}

/** `2026-03-15` for the banking day of `instant`. */
export function isoBankDate(instant: Date, timezone: string): string {
  return DateTime.fromJSDate(instant, { zone: timezone }).toISODate() ?? '';
}

/** Start of the limit window a transfer falls into (per-transaction is the point itself). */
export function windowStart(instant: Date, timezone: string, window: LimitWindow): Date {
  if (window === 'PER_TRANSACTION') return instant;
  if (window === 'DAILY') return bankDate(instant, timezone);

  // MONTHLY windows are calendar months in the bank's timezone.
  const local = DateTime.fromJSDate(instant, { zone: timezone }).startOf('month');
  return DateTime.fromObject({ year: local.year, month: local.month, day: 1 }, { zone: 'utc' }).toJSDate();
}

/** True when the two instants fall on different banking days. */
export function isNextBankingDay(a: Date, b: Date, timezone: string): boolean {
  return isoBankDate(a, timezone) !== isoBankDate(b, timezone);
}

/**
 * Business reference in the bank's own style, e.g. `MRD-TRF-20260315-8QK3ZM`.
 * Sequence-free by design: references are generated before the database assigns a
 * sequence, so the hash never depends on a value we cannot know up front.
 */
export function businessReference(
  kind: string,
  instant: Date,
  timezone: string,
  randomSuffix: () => string,
): string {
  return `MRD-${kind}-${isoBankDate(instant, timezone).replace(/-/g, '')}-${randomSuffix()}`;
}
