import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { allocateMinor } from '../src/allocation.js';
import { CurrencyCode } from '../src/currencies.js';
import { addDays, daysBetween, utcDate } from '../src/finance.js';
import { Money } from '../src/money.js';
import { Ratio } from '../src/ratio.js';
import { divRound } from '../src/rounding.js';

const currencyArb = fc.constantFrom<CurrencyCode>('USD', 'EUR', 'GBP', 'NGN', 'JPY', 'CHF');
const minorArb = fc.bigInt({ min: -(10n ** 15n), max: 10n ** 15n });
const positiveMinorArb = fc.bigInt({ min: 0n, max: 10n ** 15n });
const weightsArb = fc.array(fc.integer({ min: 0, max: 1_000_000 }), {
  minLength: 1,
  maxLength: 16,
});

const RUNS = 500;

describe('money invariants (property based)', () => {
  it('addition and subtraction are exact inverses', () => {
    fc.assert(
      fc.property(minorArb, minorArb, currencyArb, (left, right, currency) => {
        const a = Money.of(left, currency);
        const b = Money.of(right, currency);
        expect(a.add(b).subtract(b).equals(a)).toBe(true);
        expect(a.add(b).subtract(a).equals(b)).toBe(true);
        expect(a.subtract(a).isZero).toBe(true);
      }),
      { numRuns: RUNS },
    );
  });

  it('addition is commutative and associative', () => {
    fc.assert(
      fc.property(minorArb, minorArb, minorArb, currencyArb, (a, b, c, currency) => {
        const first = Money.of(a, currency);
        const second = Money.of(b, currency);
        const third = Money.of(c, currency);
        expect(first.add(second).equals(second.add(first))).toBe(true);
        expect(first.add(second).add(third).equals(first.add(second.add(third)))).toBe(true);
      }),
      { numRuns: RUNS },
    );
  });

  it('decimal parsing and rendering round-trip exactly', () => {
    fc.assert(
      fc.property(minorArb, currencyArb, (minor, currency) => {
        const money = Money.of(minor, currency);
        const reparsed = Money.fromDecimalString(money.toDecimalString(), currency);
        expect(reparsed.minor).toBe(minor);
        expect(reparsed.currency).toBe(currency);
      }),
      { numRuns: RUNS },
    );
  });

  it('JSON serialisation survives values beyond the float-safe range', () => {
    fc.assert(
      fc.property(minorArb, currencyArb, (minor, currency) => {
        const money = Money.of(minor, currency);
        const revived = Money.fromJSON(JSON.parse(JSON.stringify(money)));
        expect(revived.minor).toBe(minor);
      }),
      { numRuns: RUNS },
    );
  });

  it('rounding never drifts more than half a minor unit', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: -(10n ** 20n), max: 10n ** 20n }),
        fc.bigInt({ min: 1n, max: 10n ** 12n }),
        (numerator, denominator) => {
          const rounded = divRound(numerator, denominator, 'HALF_EVEN');
          const error = rounded * denominator - numerator;
          const doubled = error < 0n ? -error * 2n : error * 2n;
          expect(doubled <= denominator).toBe(true);
        },
      ),
      { numRuns: RUNS },
    );
  });

  it('allocation conserves the total exactly', () => {
    fc.assert(
      fc.property(minorArb, weightsArb, (total, weights) => {
        fc.pre(weights.some((weight) => weight > 0));
        const parts = allocateMinor(total, weights);
        const sum = parts.reduce((accumulator, part) => accumulator + part, 0n);
        expect(sum).toBe(total);
        expect(parts).toHaveLength(weights.length);
      }),
      { numRuns: RUNS },
    );
  });

  it('allocation stays proportional: each part is within one minor unit of its share', () => {
    fc.assert(
      fc.property(positiveMinorArb, weightsArb, (total, weights) => {
        fc.pre(weights.some((weight) => weight > 0));
        const parts = allocateMinor(total, weights);
        const totalWeight = weights.reduce((a, b) => a + b, 0);
        for (let index = 0; index < weights.length; index += 1) {
          const exactNumerator = total * BigInt(weights[index] as number);
          const deviation = (parts[index] as bigint) * BigInt(totalWeight) - exactNumerator;
          const absolute = deviation < 0n ? -deviation : deviation;
          expect(absolute < BigInt(totalWeight)).toBe(true);
        }
      }),
      { numRuns: RUNS },
    );
  });

  it('split never loses a minor unit', () => {
    fc.assert(
      fc.property(minorArb, fc.integer({ min: 1, max: 24 }), currencyArb, (minor, parts, currency) => {
        const pieces = Money.of(minor, currency).split(parts);
        expect(pieces).toHaveLength(parts);
        expect(Money.sum(pieces, currency).minor).toBe(minor);
        const spread = pieces.map((piece) => piece.minor);
        expect(Math.max(...spread.map(Number)) - Math.min(...spread.map(Number))).toBeLessThanOrEqual(1);
      }),
      { numRuns: RUNS },
    );
  });

  it('ratio scaling is monotonic in the ratio', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 0n, max: 10n ** 12n }),
        fc.bigInt({ min: 1n, max: 10n ** 6n }),
        fc.bigInt({ min: 1n, max: 10n ** 6n }),
        (minor, leftRate, rightRate) => {
          const low = leftRate < rightRate ? leftRate : rightRate;
          const high = leftRate < rightRate ? rightRate : leftRate;
          const amount = Money.of(minor, 'USD');
          const lowResult = amount.multiplyByRatio(Ratio.of(low, 1_000_000n));
          const highResult = amount.multiplyByRatio(Ratio.of(high, 1_000_000n));
          expect(lowResult.lessThanOrEqual(highResult)).toBe(true);
        },
      ),
      { numRuns: RUNS },
    );
  });

  it('scaling by a ratio then the inverse returns to the original amount', () => {
    fc.assert(
      fc.property(minorArb, fc.bigInt({ min: 1n, max: 10n ** 9n }), (minor, factor) => {
        const amount = Money.of(minor, 'USD');
        const scaled = amount.multiplyByRatio(Ratio.of(factor, 1n));
        const restored = scaled.divideByInteger(factor);
        expect(restored.minor).toBe(minor);
      }),
      { numRuns: RUNS },
    );
  });

  it('day arithmetic is additive and reversible', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1970, max: 2100 }),
        fc.integer({ min: 1, max: 12 }),
        fc.integer({ min: 1, max: 28 }),
        fc.integer({ min: 0, max: 5000 }),
        fc.integer({ min: 0, max: 5000 }),
        (year, month, day, firstOffset, secondOffset) => {
          const start = utcDate(year, month, day);
          expect(daysBetween(start, addDays(start, firstOffset))).toBe(firstOffset);
          expect(daysBetween(start, addDays(start, firstOffset + secondOffset))).toBe(
            firstOffset + secondOffset,
          );
          expect(addDays(addDays(start, firstOffset), secondOffset).getTime()).toBe(
            addDays(start, firstOffset + secondOffset).getTime(),
          );
        },
      ),
      { numRuns: RUNS },
    );
  });
});
