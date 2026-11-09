import { describe, expect, it } from 'vitest';
import { WEIGHT_SCALE, allocateMinor, normalizeWeights } from '../src/allocation.js';
import { InvalidWeightsError } from '../src/errors.js';

describe('allocateMinor', () => {
  it('never loses or invents a minor unit', () => {
    // 1.00 split three ways cannot be equal, but it must still total 1.00.
    expect(allocateMinor(100n, [1, 1, 1])).toEqual([34n, 33n, 33n]);
    expect(allocateMinor(10n, [1, 1, 1])).toEqual([4n, 3n, 3n]);
    expect(allocateMinor(1n, [1, 1, 1])).toEqual([1n, 0n, 0n]);
    expect(allocateMinor(0n, [1, 1, 1])).toEqual([0n, 0n, 0n]);
  });

  it('honours proportional weights', () => {
    // 70/20/10 of 100.00 -> 70.00 / 20.00 / 10.00
    expect(allocateMinor(10000n, [70, 20, 10])).toEqual([7000n, 2000n, 1000n]);
    // 1/3 weight of 10.00 -> 3.33 / 6.67, remainder to the largest fraction
    expect(allocateMinor(1000n, [1, 2])).toEqual([333n, 667n]);
  });

  it('accepts fractional weights', () => {
    expect(allocateMinor(100n, [0.5, 0.5])).toEqual([50n, 50n]);
    expect(allocateMinor(100n, [0.25, 0.75])).toEqual([25n, 75n]);
    expect(allocateMinor(1000n, [0.333333, 0.333333, 0.333334])).toEqual([333n, 333n, 334n]);
  });

  it('treats integer bigint weights like integer number weights', () => {
    expect(allocateMinor(1000n, [3n, 1n])).toEqual(allocateMinor(1000n, [3, 1]));
  });

  it('allocates negative totals symmetrically', () => {
    expect(allocateMinor(-100n, [1, 1, 1])).toEqual([-34n, -33n, -33n]);
    const parts = allocateMinor(-1000n, [1, 2]);
    expect(parts.reduce((a, b) => a + b, 0n)).toBe(-1000n);
  });

  it('is deterministic for equal remainders', () => {
    const first = allocateMinor(100n, [1, 1, 1, 1, 1, 1]);
    const second = allocateMinor(100n, [1, 1, 1, 1, 1, 1]);
    expect(first).toEqual(second);
    expect(first).toEqual([17n, 17n, 17n, 17n, 16n, 16n]);
  });

  it('handles a single weight', () => {
    expect(allocateMinor(1234n, [1])).toEqual([1234n]);
    expect(allocateMinor(1234n, [7n])).toEqual([1234n]);
  });

  it('uses exact bigint weights for very large totals', () => {
    const total = 10n ** 20n;
    const parts = allocateMinor(total, [1n, 3n]);
    expect(parts.reduce((a, b) => a + b, 0n)).toBe(total);
    expect(parts[0]).toBe(total / 4n);
  });

  it('rejects impossible inputs', () => {
    expect(() => allocateMinor(100n, [])).toThrow(InvalidWeightsError);
    expect(() => allocateMinor(100n, [0, 0])).toThrow(InvalidWeightsError);
    expect(() => allocateMinor(100n, [-1, 2])).toThrow(InvalidWeightsError);
    expect(() => allocateMinor(100n, [Number.NaN])).toThrow(InvalidWeightsError);
    expect(() => allocateMinor(100n, [Number.POSITIVE_INFINITY])).toThrow(InvalidWeightsError);
    expect(() => allocateMinor(100n, [-1n])).toThrow(InvalidWeightsError);
  });
});

describe('normalizeWeights', () => {
  it('scales numbers and bigints onto the same grid', () => {
    const factor = 10n ** BigInt(WEIGHT_SCALE);
    expect(normalizeWeights([1, 2])).toEqual([factor, 2n * factor]);
    expect(normalizeWeights([1n, 2n])).toEqual([factor, 2n * factor]);
    expect(normalizeWeights([0.5])).toEqual([factor / 2n]);
  });

  it('absorbs float representation error in decimal weights', () => {
    // 0.1 + 0.2 style inputs must not produce a fractional bigint.
    expect(normalizeWeights([0.1, 0.2])).toEqual([100_000n, 200_000n]);
    expect(normalizeWeights([0.7])).toEqual([700_000n]);
  });
});
