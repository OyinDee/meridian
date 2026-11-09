import { DivisionByZeroError } from './errors.js';

/**
 * Rounding modes for exact rational -> integer conversion.
 *
 * - HALF_EVEN: banker's rounding, the default for financial accruals and FX.
 * - HALF_UP / HALF_DOWN: the "school" tie-breakers.
 * - UP: away from zero. DOWN: toward zero (truncate).
 * - FLOOR / CEIL: toward -inf / +inf (meaningful for negative balances).
 */
export type RoundingMode = 'HALF_EVEN' | 'HALF_UP' | 'HALF_DOWN' | 'UP' | 'DOWN' | 'FLOOR' | 'CEIL';

export const ROUNDING_MODES: readonly RoundingMode[] = [
  'HALF_EVEN',
  'HALF_UP',
  'HALF_DOWN',
  'UP',
  'DOWN',
  'FLOOR',
  'CEIL',
];

/**
 * Exact `numerator / denominator` rounded to the nearest integer under `mode`.
 *
 * Implemented on bigint so nothing is ever routed through IEEE-754 floats: a float
 * cannot represent 0.1 exactly, and a ledger that drifts by one minor unit is broken.
 */
export function divRound(
  numerator: bigint,
  denominator: bigint,
  mode: RoundingMode = 'HALF_EVEN',
): bigint {
  if (denominator === 0n) throw new DivisionByZeroError();

  // bigint division truncates toward zero, so `quotient` is the truncated value and
  // `remainder` carries the sign of the numerator.
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  if (remainder === 0n) return quotient;

  const negativeResult = numerator < 0n !== denominator < 0n;
  const absRemainder = remainder < 0n ? -remainder : remainder;
  const absDenominator = denominator < 0n ? -denominator : denominator;
  const twiceRemainder = absRemainder * 2n;

  const awayFromZero = (): bigint => (negativeResult ? quotient - 1n : quotient + 1n);

  switch (mode) {
    case 'DOWN':
      return quotient;
    case 'UP':
      return awayFromZero();
    case 'FLOOR':
      return negativeResult ? quotient - 1n : quotient;
    case 'CEIL':
      return negativeResult ? quotient : quotient + 1n;
    case 'HALF_UP':
      return twiceRemainder >= absDenominator ? awayFromZero() : quotient;
    case 'HALF_DOWN':
      return twiceRemainder > absDenominator ? awayFromZero() : quotient;
    case 'HALF_EVEN': {
      if (twiceRemainder > absDenominator) return awayFromZero();
      if (twiceRemainder < absDenominator) return quotient;
      // Exactly half: pick the neighbour whose last digit is even, so that the
      // rounding bias cancels out over many operations.
      return quotient % 2n === 0n ? quotient : awayFromZero();
    }
  }
}

/** 10^n as a bigint (n >= 0). */
export function powerOfTen(exponent: number): bigint {
  if (!Number.isInteger(exponent) || exponent < 0) {
    throw new RangeError(`powerOfTen expects a non-negative integer, received ${exponent}`);
  }
  return 10n ** BigInt(exponent);
}

/** Euclidean greatest common divisor for bigints. */
export function gcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x;
}
