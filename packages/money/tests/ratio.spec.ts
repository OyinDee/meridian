import { describe, expect, it } from 'vitest';
import { InvalidRatioError } from '../src/errors.js';
import { Ratio, percent } from '../src/ratio.js';

describe('Ratio.fromDecimalString', () => {
  it('parses decimals exactly and reduces them', () => {
    expect(Ratio.fromDecimalString('0.0575').numerator).toBe(23n);
    expect(Ratio.fromDecimalString('0.0575').denominator).toBe(400n);

    expect(Ratio.fromDecimalString('1.16').numerator).toBe(29n);
    expect(Ratio.fromDecimalString('1.16').denominator).toBe(25n);

    expect(Ratio.fromDecimalString('0.06').numerator).toBe(3n);
    expect(Ratio.fromDecimalString('0.06').denominator).toBe(50n);
  });

  it('handles integers, signs and exponent notation', () => {
    expect(Ratio.fromDecimalString('7').numerator).toBe(7n);
    expect(Ratio.fromDecimalString('7').denominator).toBe(1n);
    expect(Ratio.fromDecimalString('-0.5').numerator).toBe(-1n);
    expect(Ratio.fromDecimalString('-0.5').denominator).toBe(2n);
    expect(Ratio.fromDecimalString('2.5e-3').numerator).toBe(1n);
    expect(Ratio.fromDecimalString('2.5e-3').denominator).toBe(400n);
    expect(Ratio.fromDecimalString('0').isZero).toBe(true);
  });

  it('refuses anything that is not a plain decimal', () => {
    for (const input of ['', 'abc', '1,5', '1.2.3', '0x10']) {
      expect(() => Ratio.fromDecimalString(input)).toThrow(InvalidRatioError);
    }
  });
});

describe('Ratio arithmetic', () => {
  it('adds, subtracts, multiplies and divides exactly', () => {
    const half = Ratio.fromDecimalString('0.5');
    const third = Ratio.ONE.divideInteger(3);

    expect(half.add(third).toDecimalString(6)).toBe('0.833333');
    expect(Ratio.ONE.subtract(third).toDecimalString(6)).toBe('0.666667');
    expect(half.multiply(third).equals(Ratio.of(1n, 6n))).toBe(true);
    expect(half.divide(half).equals(Ratio.ONE)).toBe(true);
    expect(third.multiplyInteger(6n).equals(Ratio.fromInteger(2))).toBe(true);
  });

  it('raises to an exact integer power', () => {
    // (1 + 0.005)^12, the compounding factor for a 6% nominal rate paid monthly.
    const growth = Ratio.ONE.add(Ratio.fromDecimalString('0.005')).pow(12);
    expect(growth.toDecimalString(10)).toBe('1.0616778118');

    expect(Ratio.fromInteger(2).pow(0).equals(Ratio.ONE)).toBe(true);
    expect(Ratio.fromInteger(2).pow(10).equals(Ratio.fromInteger(1024))).toBe(true);
    expect(() => Ratio.fromInteger(2).pow(-1)).toThrow(InvalidRatioError);
  });

  it('routes divide by zero to a domain error', () => {
    expect(() => Ratio.of(1n, 0n)).toThrow(InvalidRatioError);
    expect(() => Ratio.ONE.divide(Ratio.ZERO)).toThrow(InvalidRatioError);
    expect(() => Ratio.ONE.divideInteger(0n)).toThrow(InvalidRatioError);
  });

  it('compares ratios without converting to floats', () => {
    const a = Ratio.of(1n, 3n);
    const b = Ratio.of(1n, 4n);
    expect(a.compare(b)).toBe(1);
    expect(a.greaterThan(b)).toBe(true);
    expect(b.lessThan(a)).toBe(true);
    expect(a.equals(Ratio.of(2n, 6n))).toBe(true);
  });

  it('renders decimals with a chosen rounding mode', () => {
    const third = Ratio.ONE.divideInteger(3);
    expect(third.toDecimalString(2, 'HALF_UP')).toBe('0.33');
    expect(third.toDecimalString(4)).toBe('0.3333');
    expect(third.negate().toDecimalString(2, 'HALF_UP')).toBe('-0.33');

    const twoThirds = Ratio.of(2n, 3n);
    expect(twoThirds.toDecimalString(0, 'HALF_EVEN')).toBe('1');
    expect(twoThirds.toDecimalString(2, 'HALF_UP')).toBe('0.67');
  });

  it('normalises sign into the numerator', () => {
    const ratio = Ratio.of(1n, -4n);
    expect(ratio.numerator).toBe(-1n);
    expect(ratio.denominator).toBe(4n);
    expect(ratio.isNegative).toBe(true);
  });
});

describe('percent', () => {
  it('converts percentage text to a ratio', () => {
    expect(percent('6.5').equals(Ratio.of(65n, 1000n))).toBe(true);
    expect(percent('6.5').equals(Ratio.of(13n, 200n))).toBe(true);
    expect(percent('100').equals(Ratio.ONE)).toBe(true);
  });
});
