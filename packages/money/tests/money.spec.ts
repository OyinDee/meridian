import { describe, expect, it } from 'vitest';
import { DEFAULT_CURRENCY, DEFAULT_LOCALE, getCurrency } from '../src/currencies.js';
import {
  CurrencyMismatchError,
  InvalidAmountError,
  PrecisionError,
  UnknownCurrencyError,
} from '../src/errors.js';
import { Money } from '../src/money.js';
import { Ratio } from '../src/ratio.js';

describe('Money construction', () => {
  it('stores amounts as integer minor units', () => {
    expect(Money.of(1234, 'USD').minor).toBe(1234n);
    expect(Money.of(1234, 'USD').toDecimalString()).toBe('12.34');
    expect(Money.of(-5, 'USD').toDecimalString()).toBe('-0.05');
    expect(Money.of(0, 'USD').toDecimalString()).toBe('0.00');
  });

  it('parses decimal strings exactly, with no float involved', () => {
    expect(Money.fromDecimalString('1234.56', 'USD').minor).toBe(123456n);
    expect(Money.fromDecimalString('0.1', 'USD').minor).toBe(10n);
    expect(Money.fromDecimalString('0.07', 'USD').minor).toBe(7n);
    // 0.1 + 0.2 in floats is 0.30000000000000004; here it is exactly 30 minor units.
    expect(
      Money.fromDecimalString('0.1', 'USD').add(Money.fromDecimalString('0.2', 'USD')).minor,
    ).toBe(30n);
    expect(Money.fromDecimalString('+3', 'USD').minor).toBe(300n);
    expect(Money.fromDecimalString('3.', 'USD').minor).toBe(300n);
    expect(Money.fromDecimalString('.5', 'USD').minor).toBe(50n);
    expect(Money.fromDecimalString('-.5', 'USD').minor).toBe(-50n);
    expect(() => Money.fromDecimalString('.', 'USD')).toThrow(InvalidAmountError);
  });

  it('respects the currency scale', () => {
    expect(Money.fromDecimalString('1234', 'JPY').minor).toBe(1234n);
    expect(Money.fromDecimalString('1234', 'JPY').toDecimalString()).toBe('1234');
    expect(Money.fromDecimalString('1234.56', 'JPY', { rounding: 'DOWN' }).minor).toBe(1234n);
  });

  it('treats excess precision as an error unless rounding is requested', () => {
    expect(() => Money.fromDecimalString('1.005', 'USD')).toThrow(PrecisionError);
    expect(() => Money.fromDecimalString('1.234', 'USD')).toThrow(PrecisionError);
    // Trailing zeros beyond the scale are not a loss of precision.
    expect(Money.fromDecimalString('1.2300', 'USD').minor).toBe(123n);
    expect(Money.fromDecimalString('1.0000', 'USD').minor).toBe(100n);
    // Explicit rounding: banker's gives 1.00 (even), HALF_UP gives 1.01.
    expect(Money.fromDecimalString('1.005', 'USD', { rounding: 'HALF_EVEN' }).minor).toBe(100n);
    expect(Money.fromDecimalString('1.005', 'USD', { rounding: 'HALF_UP' }).minor).toBe(101n);
  });

  it('rejects malformed input and unknown currencies', () => {
    expect(() => Money.fromDecimalString('1,234.56', 'USD')).toThrow(InvalidAmountError);
    expect(() => Money.fromDecimalString('abc', 'USD')).toThrow(InvalidAmountError);
    expect(() => Money.fromDecimalString('', 'USD')).toThrow(InvalidAmountError);
    expect(() => Money.of('1.5', 'USD')).toThrow(InvalidAmountError);
    expect(() => Money.of(1.5, 'USD')).toThrow(InvalidAmountError);
    expect(() => Money.of(1, 'XXX' as 'USD')).toThrow(UnknownCurrencyError);
  });

  it('accepts only exactly representable numbers via fromNumberStrict', () => {
    expect(Money.fromNumberStrict(12.34, 'USD').minor).toBe(1234n);
    expect(() => Money.fromNumberStrict(0.1 + 0.2, 'USD')).toThrow(InvalidAmountError);
    expect(() => Money.fromNumberStrict(Number.NaN, 'USD')).toThrow(InvalidAmountError);
  });
});

describe('Money arithmetic', () => {
  const hundred = Money.fromDecimalString('100.00', 'USD');
  const thirty = Money.fromDecimalString('30.00', 'USD');

  it('adds and subtracts', () => {
    expect(hundred.add(thirty).toDecimalString()).toBe('130.00');
    expect(hundred.subtract(thirty).toDecimalString()).toBe('70.00');
    expect(thirty.subtract(hundred).toDecimalString()).toBe('-70.00');
    expect(hundred.subtract(hundred).isZero).toBe(true);
    expect(hundred.add(thirty).subtract(thirty).equals(hundred)).toBe(true);
  });

  it('refuses to mix currencies', () => {
    expect(() => hundred.add(Money.fromDecimalString('1.00', 'EUR'))).toThrow(
      CurrencyMismatchError,
    );
    expect(() => hundred.compare(Money.fromDecimalString('1.00', 'EUR'))).toThrow(
      CurrencyMismatchError,
    );
  });

  it('multiplies by a ratio and rounds once', () => {
    // 1234.56 * 5.75% = 70.9872 -> 70.99
    const interest = hundred.multiplyByRatio(Ratio.fromDecimalString('0.0575'));
    expect(interest.minor).toBe(575n);

    const rate = Ratio.fromDecimalString('0.0575');
    expect(Money.of(123456, 'USD').multiplyByRatio(rate).minor).toBe(7099n);
    expect(Money.of(123456, 'USD').multiplyByRatio(rate, 'DOWN').minor).toBe(7098n);
    expect(Money.of(123456, 'USD').multiplyByRatio(rate, 'UP').minor).toBe(7099n);
  });

  it('scales exactly by integers', () => {
    expect(hundred.multiplyByInteger(3).toDecimalString()).toBe('300.00');
    expect(hundred.multiplyByInteger(0n).isZero).toBe(true);
    expect(hundred.multiplyByInteger(-1).toDecimalString()).toBe('-100.00');
  });

  it('divides with explicit rounding', () => {
    expect(hundred.divideByInteger(3, 'DOWN').minor).toBe(3333n);
    expect(hundred.divideByInteger(3, 'UP').minor).toBe(3334n);
    expect(() => hundred.divideByInteger(0)).toThrow(InvalidAmountError);
  });

  it('compares, clamps and aggregates', () => {
    expect(hundred.compare(thirty)).toBe(1);
    expect(thirty.lessThan(hundred)).toBe(true);
    expect(hundred.greaterThanOrEqual(hundred)).toBe(true);
    expect(thirty.min(hundred).equals(thirty)).toBe(true);
    expect(thirty.max(hundred).equals(hundred)).toBe(true);
    expect(Money.of(500, 'USD').clamp(Money.of(100, 'USD'), Money.of(200, 'USD')).minor).toBe(200n);
    expect(Money.sum([hundred, thirty], 'USD').toDecimalString()).toBe('130.00');
    expect(Money.sum([], 'USD').isZero).toBe(true);
    expect(hundred.abs.minor).toBe(10000n);
    expect(hundred.negate().negate().equals(hundred)).toBe(true);
  });
});

describe('Money.render', () => {
  it('formats with Intl for realistic amounts', () => {
    expect(Money.of(123456, 'USD').format('en-US')).toBe('$1,234.56');
    expect(Money.of(1234, 'JPY').format('en-US')).toBe('¥1,234');
    expect(Money.of(-5, 'USD').format('en-US')).toBe('-$0.05');
    expect(Money.of(123456, 'USD').format('en-US', { currencyDisplay: 'code' })).toBe('USD 1,234.56');
  });

  it('treats naira as the home currency with kobo as its minor unit', () => {
    expect(DEFAULT_CURRENCY).toBe('NGN');
    expect(getCurrency('NGN').symbol).toBe('₦');
    expect(getCurrency('NGN').scale).toBe(2);
    expect(Money.fromDecimalString('250000', 'NGN').minor).toBe(25000000n);
    expect(Money.of(25000000, 'NGN').toDecimalString()).toBe('250000.00');
    expect(Money.of(123456, 'NGN').format(DEFAULT_LOCALE)).toMatch(/^₦\s?1,234\.56$/);
    expect(Money.of(1, 'NGN').toDecimalString()).toBe('0.01');
  });

  it('falls back to manual grouping beyond Number.MAX_SAFE_INTEGER', () => {
    const huge = Money.of('12345678901234567890', 'USD');
    expect(huge.format('en-US')).toBe('123,456,789,012,345,678.90 USD');
  });

  it('round-trips through JSON without losing minor units', () => {
    const original = Money.of('9007199254740993', 'USD');
    const revived = Money.fromJSON(original.toJSON());
    expect(revived.minor).toBe(original.minor);
    expect(revived.currency).toBe('USD');
    expect(original.toJSON().minor).toBe('9007199254740993');
    expect(Money.fromJSON('USD 12.34').minor).toBe(1234n);
    expect(() => Money.fromJSON('USD nope')).toThrow(InvalidAmountError);
  });

  it('renders a stable string form', () => {
    expect(Money.of(1234, 'USD').toString()).toBe('USD 12.34');
    expect(JSON.stringify({ amount: Money.of(1234, 'USD') })).toBe(
      '{"amount":{"minor":"1234","currency":"USD","amount":"12.34"}}',
    );
  });
});
