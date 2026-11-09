import { allocateMinor } from './allocation.js';
import { CURRENCY_SPECS, CurrencyCode, getCurrency } from './currencies.js';
import { CurrencyMismatchError, InvalidAmountError, PrecisionError } from './errors.js';
import { Ratio } from './ratio.js';
import { RoundingMode, divRound, powerOfTen } from './rounding.js';

const DECIMAL_PATTERN = /^([+-]?)(\d*)(?:\.(\d*))?$/;
const INTEGER_PATTERN = /^[+-]?\d+$/;
const FORMATTER_CACHE = new Map<string, Intl.NumberFormat>();
const MAX_SAFE_MINOR = BigInt(Number.MAX_SAFE_INTEGER);

export interface MoneyJSON {
  /** Minor units as a decimal string (JSON has no bigint). */
  readonly minor: string;
  readonly currency: CurrencyCode;
  /** Human-readable rendering, e.g. "1234.56". */
  readonly amount: string;
}

export interface FromDecimalOptions {
  /**
   * Permit amounts with more fraction digits than the currency allows by rounding.
   * Omit it and excess precision is an error rather than a silent truncation.
   */
  readonly rounding?: RoundingMode;
}

function assertCurrency(code: string): CurrencyCode {
  getCurrency(code);
  return code as CurrencyCode;
}

function toBigInt(value: bigint | number | string): bigint {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) {
      throw new InvalidAmountError(
        `Minor units must be a safe integer, received ${value}. Use Money.fromDecimalString for decimal input.`,
      );
    }
    return BigInt(value);
  }
  if (!INTEGER_PATTERN.test(value.trim())) {
    throw new InvalidAmountError(`Minor units must be an integer string, received "${value}"`);
  }
  return BigInt(value.trim());
}

/**
 * An exact monetary amount: a bigint count of minor units plus a currency.
 *
 * There is no floating point anywhere in this class. `USD 1234.56` is the bigint
 * `123456`, and `JPY 1234` is the bigint `1234` because the yen has no minor unit.
 * Instances are immutable; every operation returns a new Money.
 */
export class Money {
  /** Amount in minor units (cents, kobo, ...). Never a float. */
  readonly minor: bigint;
  readonly currency: CurrencyCode;

  private constructor(minor: bigint, currency: CurrencyCode) {
    this.minor = minor;
    this.currency = currency;
  }

  // ---------------------------------------------------------------- factories

  static zero(currency: CurrencyCode): Money {
    return new Money(0n, assertCurrency(currency));
  }

  /** Build from minor units. `Money.of(1234, 'USD')` is $12.34. */
  static of(minor: bigint | number | string, currency: CurrencyCode): Money {
    return new Money(toBigInt(minor), assertCurrency(currency));
  }

  /** Build from a major-unit decimal string. Exact: no float parser involved. */
  static fromDecimalString(
    amount: string,
    currency: CurrencyCode,
    options: FromDecimalOptions = {},
  ): Money {
    const spec = getCurrency(currency);
    const match = DECIMAL_PATTERN.exec(amount.trim());
    if (!match) throw new InvalidAmountError(`Not a decimal amount: "${amount}"`);

    const [, sign, integerPart = '0', fractionPart = ''] = match;
    if (integerPart === '' && fractionPart === '') {
      throw new InvalidAmountError(`Not a decimal amount: "${amount}"`);
    }
    const negative = sign === '-';
    const fractionDigits = fractionPart.length;

    let magnitude: bigint;
    if (fractionDigits > spec.scale) {
      const excess = fractionDigits - spec.scale;
      const discarded = fractionPart.slice(spec.scale);
      // Excess digits that are all zeros are not a precision loss ("1.2300" is fine);
      // anything else requires an explicit rounding mode.
      if (options.rounding === undefined && !/^0*$/.test(discarded)) {
        throw new PrecisionError(amount, currency, spec.scale);
      }
      magnitude = divRound(
        BigInt(`${integerPart}${fractionPart}`),
        powerOfTen(excess),
        options.rounding ?? 'HALF_EVEN',
      );
    } else {
      magnitude = BigInt(`${integerPart}${fractionPart.padEnd(spec.scale, '0')}`);
    }

    return new Money(negative ? -magnitude : magnitude, currency);
  }

  /**
   * Build from a JS number. Only safe when the value is exactly representable in the
   * currency's minor unit (e.g. seed data, tests); prefer `fromDecimalString`.
   */
  static fromNumberStrict(amount: number, currency: CurrencyCode): Money {
    const spec = getCurrency(currency);
    if (!Number.isFinite(amount)) throw new InvalidAmountError(`Amount must be finite: ${amount}`);
    const scaled = amount * 10 ** spec.scale;
    if (!Number.isSafeInteger(Math.round(scaled * 1000))) {
      throw new InvalidAmountError(`Amount is not exactly representable: ${amount}`);
    }
    const rounded = Math.round(scaled);
    if (Math.abs(scaled - rounded) > 1e-6) {
      throw new InvalidAmountError(
        `Amount ${amount} cannot be represented exactly in ${currency}; use fromDecimalString.`,
      );
    }
    return new Money(BigInt(rounded), currency);
  }

  static fromJSON(json: MoneyJSON | string): Money {
    if (typeof json === 'string') {
      const [currency, amount] = json.split(' ');
      if (!currency || !amount) throw new InvalidAmountError(`Cannot parse money from "${json}"`);
      return Money.fromDecimalString(amount, assertCurrency(currency));
    }
    return Money.of(json.minor, assertCurrency(json.currency));
  }

  static sum(amounts: readonly Money[], currency: CurrencyCode): Money {
    return amounts.reduce((total, amount) => total.add(amount), Money.zero(currency));
  }

  // ---------------------------------------------------------------- accessors

  get scale(): number {
    return CURRENCY_SPECS[this.currency].scale;
  }

  get isZero(): boolean {
    return this.minor === 0n;
  }

  get isNegative(): boolean {
    return this.minor < 0n;
  }

  get isPositive(): boolean {
    return this.minor > 0n;
  }

  get isNegativeOrZero(): boolean {
    return this.minor <= 0n;
  }

  /** Absolute value, useful for reporting a debit/credit as a magnitude. */
  get abs(): Money {
    return this.minor < 0n ? new Money(-this.minor, this.currency) : this;
  }

  // --------------------------------------------------------------- arithmetic

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.minor + other.minor, this.currency);
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.minor - other.minor, this.currency);
  }

  negate(): Money {
    return new Money(-this.minor, this.currency);
  }

  /** Exact scaling by an integer (multiplicity, number of periods, ...). */
  multiplyByInteger(factor: bigint | number): Money {
    const multiplier = typeof factor === 'number' ? toBigInt(factor) : factor;
    return new Money(this.minor * multiplier, this.currency);
  }

  /**
   * Scale by an exact ratio and round once, to the currency's minor unit.
   * This is how interest, FX and fee percentages are applied.
   */
  multiplyByRatio(ratio: Ratio, mode: RoundingMode = 'HALF_EVEN'): Money {
    return new Money(
      divRound(this.minor * ratio.numerator, ratio.denominator, mode),
      this.currency,
    );
  }

  divideByInteger(divisor: bigint | number, mode: RoundingMode = 'HALF_EVEN'): Money {
    const value = typeof divisor === 'number' ? toBigInt(divisor) : divisor;
    if (value === 0n) throw new InvalidAmountError('Division by zero');
    return new Money(divRound(this.minor, value, mode), this.currency);
  }

  /** Exact ratio representation, for further exact math before a single rounding. */
  toRatio(): Ratio {
    return Ratio.of(this.minor, 1n);
  }

  /**
   * Split this amount into parts proportional to `weights`, losing nothing.
   * Used for fee splits, revenue sharing and multi-leg allocations.
   */
  allocate(weights: readonly (number | bigint)[]): Money[] {
    return allocateMinor(this.minor, weights).map((minor) => new Money(minor, this.currency));
  }

  /** Split into `parts` as evenly as possible, remainder to the earliest parts. */
  split(parts: number): Money[] {
    if (!Number.isInteger(parts) || parts < 1) {
      throw new InvalidAmountError(`split() expects a positive integer, received ${parts}`);
    }
    return this.allocate(Array.from({ length: parts }, () => 1));
  }

  // -------------------------------------------------------------- comparisons

  compare(other: Money): -1 | 0 | 1 {
    this.assertSameCurrency(other);
    if (this.minor < other.minor) return -1;
    if (this.minor > other.minor) return 1;
    return 0;
  }

  equals(other: Money): boolean {
    return this.currency === other.currency && this.minor === other.minor;
  }

  greaterThan(other: Money): boolean {
    return this.compare(other) === 1;
  }

  greaterThanOrEqual(other: Money): boolean {
    return this.compare(other) >= 0;
  }

  lessThan(other: Money): boolean {
    return this.compare(other) === -1;
  }

  lessThanOrEqual(other: Money): boolean {
    return this.compare(other) <= 0;
  }

  min(other: Money): Money {
    return this.lessThanOrEqual(other) ? this : other;
  }

  max(other: Money): Money {
    return this.greaterThanOrEqual(other) ? this : other;
  }

  clamp(min: Money, max: Money): Money {
    return this.max(min).min(max);
  }

  // --------------------------------------------------------------- rendering

  /** "1234.56", "-0.05", "1234" (JPY). Never uses a float. */
  toDecimalString(): string {
    const negative = this.minor < 0n;
    const digits = (negative ? -this.minor : this.minor).toString().padStart(this.scale + 1, '0');
    if (this.scale === 0) return `${negative ? '-' : ''}${digits}`;
    const whole = digits.slice(0, digits.length - this.scale);
    const fraction = digits.slice(digits.length - this.scale);
    return `${negative ? '-' : ''}${whole}.${fraction}`;
  }

  /**
   * Locale-aware rendering via Intl, with a manual fallback for amounts beyond
   * `Number.MAX_SAFE_INTEGER` where Intl would silently lose precision.
   */
  format(locale = 'en-US', options: Intl.NumberFormatOptions = {}): string {
    const spec = getCurrency(this.currency);
    const withinSafeRange = this.minor <= MAX_SAFE_MINOR && this.minor >= -MAX_SAFE_MINOR;
    if (withinSafeRange) {
      const key = `${locale}|${this.currency}|${spec.scale}|${JSON.stringify(options)}`;
      let formatter = FORMATTER_CACHE.get(key);
      if (!formatter) {
        formatter = new Intl.NumberFormat(locale, {
          style: 'currency',
          currency: this.currency,
          minimumFractionDigits: spec.scale,
          maximumFractionDigits: spec.scale,
          ...options,
        });
        FORMATTER_CACHE.set(key, formatter);
      }
      return formatter.format(Number(this.toDecimalString()));
    }
    // Very large balances: group the digits ourselves and append the code.
    const [whole = '0', fraction] = this.toDecimalString().split('.');
    const negative = whole.startsWith('-');
    const digitsOnly = negative ? whole.slice(1) : whole;
    const grouped = digitsOnly.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return `${negative ? '-' : ''}${grouped}${fraction ? `.${fraction}` : ''} ${this.currency}`;
  }

  toJSON(): MoneyJSON {
    return {
      minor: this.minor.toString(),
      currency: this.currency,
      amount: this.toDecimalString(),
    };
  }

  toString(): string {
    return `${this.currency} ${this.toDecimalString()}`;
  }

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new CurrencyMismatchError(this.currency, other.currency);
    }
  }
}
