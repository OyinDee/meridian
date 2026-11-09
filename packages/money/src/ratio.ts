import { InvalidRatioError } from './errors.js';
import { RoundingMode, divRound, gcd, powerOfTen } from './rounding.js';

const DECIMAL_PATTERN = /^([+-]?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/;

/**
 * An exact rational number, kept as `numerator / denominator` in lowest terms with a
 * positive denominator.
 *
 * Interest rates, FX rates and day-count fractions are all ratios. Storing them as
 * ratios (rather than floats) means `balance * rate` is computed once, exactly, and
 * rounded a single time at the end.
 */
export class Ratio {
  readonly numerator: bigint;
  readonly denominator: bigint;

  private constructor(numerator: bigint, denominator: bigint) {
    this.numerator = numerator;
    this.denominator = denominator;
  }

  static readonly ZERO = new Ratio(0n, 1n);
  static readonly ONE = new Ratio(1n, 1n);

  static of(numerator: bigint, denominator: bigint = 1n): Ratio {
    if (denominator === 0n) throw new InvalidRatioError('Ratio denominator must not be zero');
    let n = numerator;
    let d = denominator;
    if (d < 0n) {
      n = -n;
      d = -d;
    }
    if (n === 0n) return Ratio.ZERO;
    const factor = gcd(n, d);
    return new Ratio(n / factor, d / factor);
  }

  static fromInteger(value: bigint | number): Ratio {
    return Ratio.of(typeof value === 'number' ? BigInt(value) : value, 1n);
  }

  /**
   * Parse an exact ratio from a decimal string such as `0.0575`, `1.16` or `2.5e-3`.
   * Throws on anything that is not a plain decimal: no silent float coercion.
   */
  static fromDecimalString(text: string): Ratio {
    const match = DECIMAL_PATTERN.exec(text.trim());
    if (!match) throw new InvalidRatioError(`Not a decimal number: "${text}"`);

    const [, sign, integerPart = '0', fractionPart = '', exponentPart] = match;
    const digits = `${integerPart}${fractionPart}`;
    const exponent = exponentPart ? Number.parseInt(exponentPart, 10) : 0;
    if (!Number.isSafeInteger(exponent)) throw new InvalidRatioError(`Exponent out of range: ${text}`);

    // value = digits * 10^(exponent - fractionPart.length)
    const scale = exponent - fractionPart.length;
    const magnitude = BigInt(digits);
    const signed = sign === '-' ? -magnitude : magnitude;
    return scale >= 0
      ? Ratio.of(signed * powerOfTen(scale), 1n)
      : Ratio.of(signed, powerOfTen(-scale));
  }

  get isZero(): boolean {
    return this.numerator === 0n;
  }

  get isNegative(): boolean {
    return this.numerator < 0n;
  }

  get isPositive(): boolean {
    return this.numerator > 0n;
  }

  multiply(other: Ratio): Ratio {
    return Ratio.of(this.numerator * other.numerator, this.denominator * other.denominator);
  }

  multiplyInteger(factor: bigint | number): Ratio {
    const asBigInt = typeof factor === 'number' ? BigInt(factor) : factor;
    return Ratio.of(this.numerator * asBigInt, this.denominator);
  }

  divide(other: Ratio): Ratio {
    if (other.isZero) throw new InvalidRatioError('Division by a zero ratio');
    return Ratio.of(this.numerator * other.denominator, this.denominator * other.numerator);
  }

  divideInteger(divisor: bigint | number): Ratio {
    const asBigInt = typeof divisor === 'number' ? BigInt(divisor) : divisor;
    if (asBigInt === 0n) throw new InvalidRatioError('Division by zero');
    return Ratio.of(this.numerator, this.denominator * asBigInt);
  }

  add(other: Ratio): Ratio {
    return Ratio.of(
      this.numerator * other.denominator + other.numerator * this.denominator,
      this.denominator * other.denominator,
    );
  }

  subtract(other: Ratio): Ratio {
    return Ratio.of(
      this.numerator * other.denominator - other.numerator * this.denominator,
      this.denominator * other.denominator,
    );
  }

  negate(): Ratio {
    return Ratio.of(-this.numerator, this.denominator);
  }

  /** Exact integer power. `Ratio.fromDecimalString('1.05').pow(12)` is exact. */
  pow(exponent: number): Ratio {
    if (!Number.isInteger(exponent) || exponent < 0) {
      throw new InvalidRatioError(`pow() expects a non-negative integer exponent, got ${exponent}`);
    }
    let result = Ratio.ONE;
    let base: Ratio = this;
    let remaining = exponent;
    // Exponentiation by squaring.
    while (remaining > 0) {
      if (remaining & 1) result = result.multiply(base);
      remaining >>>= 1;
      if (remaining > 0) base = base.multiply(base);
    }
    return result;
  }

  compare(other: Ratio): -1 | 0 | 1 {
    const left = this.numerator * other.denominator;
    const right = other.numerator * this.denominator;
    if (left < right) return -1;
    if (left > right) return 1;
    return 0;
  }

  equals(other: Ratio): boolean {
    return this.compare(other) === 0;
  }

  greaterThan(other: Ratio): boolean {
    return this.compare(other) === 1;
  }

  lessThan(other: Ratio): boolean {
    return this.compare(other) === -1;
  }

  /** Lossy: for display and charting only, never for stored amounts. */
  toNumber(): number {
    return Number(this.numerator) / Number(this.denominator);
  }

  /** Decimal rendering rounded to `fractionDigits` places. */
  toDecimalString(fractionDigits = 4, mode: RoundingMode = 'HALF_EVEN'): string {
    const scaled = divRound(
      this.numerator * powerOfTen(fractionDigits),
      this.denominator,
      mode,
    );
    const negative = scaled < 0n;
    const digits = (negative ? -scaled : scaled).toString().padStart(fractionDigits + 1, '0');
    const whole = digits.slice(0, digits.length - fractionDigits);
    const fraction = fractionDigits > 0 ? `.${digits.slice(digits.length - fractionDigits)}` : '';
    return `${negative ? '-' : ''}${whole}${fraction}`;
  }

  toString(): string {
    return `${this.numerator}/${this.denominator}`;
  }
}

/** Convenience: a percentage such as 6.5 -> Ratio 65/1000. */
export function percent(value: string): Ratio {
  return Ratio.fromDecimalString(value).divideInteger(100);
}
