import { describe, expect, it } from 'vitest';
import { DivisionByZeroError } from '../src/errors.js';
import { divRound, gcd, powerOfTen } from '../src/rounding.js';

describe('divRound', () => {
  it('returns the exact quotient when there is no remainder', () => {
    expect(divRound(10n, 2n)).toBe(5n);
    expect(divRound(-10n, 2n)).toBe(-5n);
    expect(divRound(0n, 7n)).toBe(0n);
  });

  it('applies banker rounding on exact halves', () => {
    // 2.5 -> 2 (even), 3.5 -> 4 (even): the bias cancels over many operations.
    expect(divRound(5n, 2n, 'HALF_EVEN')).toBe(2n);
    expect(divRound(7n, 2n, 'HALF_EVEN')).toBe(4n);
    expect(divRound(1n, 2n, 'HALF_EVEN')).toBe(0n);
    expect(divRound(3n, 2n, 'HALF_EVEN')).toBe(2n);
  });

  it('applies banker rounding on negative halves', () => {
    expect(divRound(-5n, 2n, 'HALF_EVEN')).toBe(-2n);
    expect(divRound(-7n, 2n, 'HALF_EVEN')).toBe(-4n);
    expect(divRound(5n, -2n, 'HALF_EVEN')).toBe(-2n);
  });

  it('distinguishes every rounding mode on 2.5 and -2.5', () => {
    expect(divRound(5n, 2n, 'HALF_UP')).toBe(3n);
    expect(divRound(5n, 2n, 'HALF_DOWN')).toBe(2n);
    expect(divRound(5n, 2n, 'UP')).toBe(3n);
    expect(divRound(5n, 2n, 'DOWN')).toBe(2n);
    expect(divRound(5n, 2n, 'FLOOR')).toBe(2n);
    expect(divRound(5n, 2n, 'CEIL')).toBe(3n);

    expect(divRound(-5n, 2n, 'HALF_UP')).toBe(-3n);
    expect(divRound(-5n, 2n, 'HALF_DOWN')).toBe(-2n);
    expect(divRound(-5n, 2n, 'UP')).toBe(-3n);
    expect(divRound(-5n, 2n, 'DOWN')).toBe(-2n);
    expect(divRound(-5n, 2n, 'FLOOR')).toBe(-3n);
    expect(divRound(-5n, 2n, 'CEIL')).toBe(-2n);
  });

  it('rounds thirds correctly in both directions', () => {
    expect(divRound(1n, 3n, 'HALF_EVEN')).toBe(0n);
    expect(divRound(1n, 3n, 'CEIL')).toBe(1n);
    expect(divRound(1n, 3n, 'FLOOR')).toBe(0n);
    expect(divRound(-1n, 3n, 'HALF_EVEN')).toBe(0n);
    expect(divRound(-1n, 3n, 'FLOOR')).toBe(-1n);
    expect(divRound(-1n, 3n, 'CEIL')).toBe(0n);
  });

  it('rejects a zero denominator', () => {
    expect(() => divRound(1n, 0n)).toThrow(DivisionByZeroError);
  });

  it('stays exact for very large integers', () => {
    const huge = 10n ** 40n;
    expect(divRound(huge * 7n, 7n)).toBe(huge);
    expect(divRound(huge, 3n, 'DOWN')).toBe(huge / 3n);
  });
});

describe('powerOfTen', () => {
  it('is exact for realistic exponents', () => {
    expect(powerOfTen(0)).toBe(1n);
    expect(powerOfTen(2)).toBe(100n);
    expect(powerOfTen(18)).toBe(1_000_000_000_000_000_000n);
  });

  it('rejects negative or fractional exponents', () => {
    expect(() => powerOfTen(-1)).toThrow(RangeError);
    expect(() => powerOfTen(1.5)).toThrow(RangeError);
  });
});

describe('gcd', () => {
  it('computes the euclidean gcd with sign handling', () => {
    expect(gcd(575n, 10_000n)).toBe(25n);
    expect(gcd(-12n, 18n)).toBe(6n);
    expect(gcd(0n, 5n)).toBe(5n);
    expect(gcd(7n, 0n)).toBe(7n);
  });
});
