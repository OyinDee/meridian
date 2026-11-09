import { CurrencyCode } from './currencies.js';
import { InvalidAmountError } from './errors.js';
import { Money } from './money.js';
import { Ratio } from './ratio.js';
import { RoundingMode } from './rounding.js';

/**
 * Day-count conventions used to convert a date range into a fraction of a year.
 *
 * Banks disagree about how long "a year" is, so the convention is part of the
 * contract, not an implementation detail: ACT/365 is common for consumer savings,
 * ACT/360 for money markets, 30/360 for corporate bonds and mortgages.
 */
export type DayCountConvention = 'ACT/365' | 'ACT/360' | 'ACT/ACT' | '30/360';

const MS_PER_DAY = 86_400_000;

// --------------------------------------------------------------------- dates

export function utcDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

export function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function addDays(date: Date, days: number): Date {
  return new Date(startOfUtcDay(date).getTime() + days * MS_PER_DAY);
}

/** Month arithmetic with end-of-month clamping: 31 Jan + 1 month = 28/29 Feb. */
export function addMonths(date: Date, months: number): Date {
  const base = startOfUtcDay(date);
  const targetMonth = base.getUTCMonth() + months;
  const year = base.getUTCFullYear() + Math.floor(targetMonth / 12);
  const month = ((targetMonth % 12) + 12) % 12;
  const lastDayOfTargetMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return utcDate(year, month + 1, Math.min(base.getUTCDate(), lastDayOfTargetMonth));
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** Actual calendar days between two instants (sign preserved). */
export function daysBetween(start: Date, end: Date): number {
  return Math.round((startOfUtcDay(end).getTime() - startOfUtcDay(start).getTime()) / MS_PER_DAY);
}

/** 30/360 (US) day count: every month counts as 30 days. */
export function thirty360Days(start: Date, end: Date): number {
  const startDay = Math.min(start.getUTCDate(), 30);
  const endDay = end.getUTCDate() === 31 && startDay === 30 ? 30 : end.getUTCDate();
  return (
    (end.getUTCFullYear() - start.getUTCFullYear()) * 360 +
    (end.getUTCMonth() - start.getUTCMonth()) * 30 +
    (endDay - startDay)
  );
}

/** Length of the calendar year that contains `date`, as a Ratio denominator. */
export function daysInYear(date: Date): number {
  return isLeapYear(date.getUTCFullYear()) ? 366 : 365;
}

/**
 * Fraction of a year between two dates under the given convention.
 * ACT/ACT walks the calendar so a range spanning a leap year is priced correctly.
 */
export function dayCountFraction(
  convention: DayCountConvention,
  start: Date,
  end: Date,
): Ratio {
  if (convention === '30/360') {
    return Ratio.of(BigInt(thirty360Days(start, end)), 360n);
  }
  if (convention === 'ACT/365') {
    return Ratio.of(BigInt(daysBetween(start, end)), 365n);
  }
  if (convention === 'ACT/360') {
    return Ratio.of(BigInt(daysBetween(start, end)), 360n);
  }

  // ACT/ACT: sum the year-by-year fractions.
  const from = startOfUtcDay(start);
  const to = startOfUtcDay(end);
  let cursor = from;
  let fraction = Ratio.ZERO;
  while (cursor < to) {
    const yearEnd = utcDate(cursor.getUTCFullYear() + 1, 1, 1);
    const segmentEnd = yearEnd < to ? yearEnd : to;
    const segmentDays = daysBetween(cursor, segmentEnd);
    fraction = fraction.add(Ratio.of(BigInt(segmentDays), BigInt(daysInYear(cursor))));
    cursor = segmentEnd;
  }
  return fraction;
}

// ------------------------------------------------------------------- rates

/** Nominal annual rate -> rate per compounding period. */
export function periodicRate(annualNominalRate: Ratio, periodsPerYear: number): Ratio {
  if (!Number.isInteger(periodsPerYear) || periodsPerYear < 1) {
    throw new InvalidAmountError(`periodsPerYear must be a positive integer, got ${periodsPerYear}`);
  }
  return annualNominalRate.divideInteger(periodsPerYear);
}

/** Compounded annual rate actually paid when a nominal rate compounds n times a year. */
export function effectiveAnnualRate(annualNominalRate: Ratio, periodsPerYear: number): Ratio {
  const perPeriod = periodicRate(annualNominalRate, periodsPerYear);
  return Ratio.ONE.add(perPeriod).pow(periodsPerYear).subtract(Ratio.ONE);
}

/**
 * Interest over an arbitrary fraction of a year, rounded exactly once:
 * `principal * annualRate * fraction`.
 */
export function accruedInterest(
  principal: Money,
  annualRate: Ratio,
  yearFraction: Ratio,
  mode: RoundingMode = 'HALF_EVEN',
): Money {
  return principal.multiplyByRatio(annualRate.multiply(yearFraction), mode);
}

// ------------------------------------------------------------------- loans

/**
 * Level payment that fully amortises `principal` over `periods` periods:
 *
 *   payment = P * i * (1 + i)^n / ((1 + i)^n - 1)
 *
 * computed on exact rationals (numerator and denominator are bigints, so a 30-year
 * mortgage works out exactly) and rounded to the currency's minor unit once.
 * Payments round up by default: the final instalment absorbs the difference.
 */
export function annuityPayment(
  principal: Money,
  perPeriodRate: Ratio,
  periods: number,
  mode: RoundingMode = 'HALF_UP',
): Money {
  if (!Number.isInteger(periods) || periods < 1) {
    throw new InvalidAmountError(`periods must be a positive integer, got ${periods}`);
  }
  if (principal.isNegativeOrZero) {
    throw new InvalidAmountError('principal must be positive');
  }
  if (perPeriodRate.isZero) {
    return principal.divideByInteger(periods, mode);
  }
  const growth = Ratio.ONE.add(perPeriodRate).pow(periods);
  const factor = perPeriodRate.multiply(growth).divide(growth.subtract(Ratio.ONE));
  return principal.multiplyByRatio(factor, mode);
}

export interface AmortizationInstallment {
  /** 1-based instalment number. */
  readonly index: number;
  readonly dueDate: Date;
  readonly payment: Money;
  readonly interest: Money;
  readonly principal: Money;
  readonly openingBalance: Money;
  readonly closingBalance: Money;
  readonly cumulativeInterest: Money;
  readonly cumulativePrincipal: Money;
}

export interface AmortizationParams {
  readonly principal: Money;
  /** Nominal annual rate, e.g. Ratio.fromDecimalString('0.065') for 6.5%. */
  readonly annualRate: Ratio;
  readonly periods: number;
  readonly periodsPerYear: number;
  /** Due date of instalment #1; later instalments step by `12 / periodsPerYear` months. */
  readonly firstDueDate: Date;
  /** Contractual payment, when it differs from the computed annuity. */
  readonly fixedPayment?: Money;
  /** Rounding for interest accrual each period. Defaults to banker's rounding. */
  readonly interestRounding?: RoundingMode;
  /** Rounding for the computed payment. Defaults to up, protecting the lender. */
  readonly paymentRounding?: RoundingMode;
}

export interface AmortizationSchedule {
  readonly currency: CurrencyCode;
  readonly principal: Money;
  readonly perPeriodRate: Ratio;
  readonly nominalAnnualRate: Ratio;
  readonly payment: Money;
  readonly installments: readonly AmortizationInstallment[];
  readonly totalInterest: Money;
  readonly totalPrincipal: Money;
  readonly totalPaid: Money;
}

/**
 * Build a full amortisation schedule. Each period's interest is rounded to the minor
 * unit before it is subtracted, exactly as a bank statement would show it, and the
 * final instalment is adjusted so the closing balance is exactly zero.
 *
 * Throws if the payment cannot cover the interest (negative amortisation).
 */
export function amortizationSchedule(params: AmortizationParams): AmortizationSchedule {
  const {
    principal,
    annualRate,
    periods,
    periodsPerYear,
    firstDueDate,
    fixedPayment,
    interestRounding = 'HALF_EVEN',
    paymentRounding = 'HALF_UP',
  } = params;

  if (!Number.isInteger(periods) || periods < 1) {
    throw new InvalidAmountError(`periods must be a positive integer, got ${periods}`);
  }
  if (principal.isNegativeOrZero) throw new InvalidAmountError('principal must be positive');

  const perPeriod = periodicRate(annualRate, periodsPerYear);
  const payment = fixedPayment ?? annuityPayment(principal, perPeriod, periods, paymentRounding);
  if (payment.isNegativeOrZero) throw new InvalidAmountError('payment must be positive');

  const monthsPerPeriod = 12 / periodsPerYear;
  if (!Number.isInteger(monthsPerPeriod)) {
    throw new InvalidAmountError(
      `periodsPerYear must divide 12 evenly for date stepping, got ${periodsPerYear}`,
    );
  }

  const installments: AmortizationInstallment[] = [];
  let balance = principal;
  let cumulativeInterest = Money.zero(principal.currency);
  let cumulativePrincipal = Money.zero(principal.currency);

  for (let index = 1; index <= periods; index += 1) {
    // An over-payment can clear the loan before the term is up.
    if (balance.isZero) break;

    const openingBalance = balance;
    const interest = balance.multiplyByRatio(perPeriod, interestRounding);
    let principalPart = payment.subtract(interest);

    if (principalPart.isNegativeOrZero) {
      throw new InvalidAmountError(
        `Payment ${payment} does not cover period interest ${interest}: the loan would negatively amortise`,
      );
    }

    let actualPayment = payment;
    // Final instalment (or an over-payment) clears whatever is left.
    if (index === periods || principalPart.greaterThanOrEqual(balance)) {
      principalPart = balance;
      actualPayment = principalPart.add(interest);
    }

    balance = balance.subtract(principalPart);
    cumulativeInterest = cumulativeInterest.add(interest);
    cumulativePrincipal = cumulativePrincipal.add(principalPart);

    installments.push({
      index,
      dueDate: addMonths(firstDueDate, (index - 1) * monthsPerPeriod),
      payment: actualPayment,
      interest,
      principal: principalPart,
      openingBalance,
      closingBalance: balance,
      cumulativeInterest,
      cumulativePrincipal,
    });
  }

  return {
    currency: principal.currency,
    principal,
    perPeriodRate: perPeriod,
    nominalAnnualRate: annualRate,
    payment,
    installments,
    totalInterest: cumulativeInterest,
    totalPrincipal: cumulativePrincipal,
    totalPaid: cumulativeInterest.add(cumulativePrincipal),
  };
}

/** Outstanding balance after `paidInstallments` payments. */
export function outstandingBalance(
  schedule: AmortizationSchedule,
  paidInstallments: number,
): Money {
  if (paidInstallments <= 0) return schedule.principal;
  const last = schedule.installments[Math.min(paidInstallments, schedule.installments.length) - 1];
  return last ? last.closingBalance : Money.zero(schedule.currency);
}

// -------------------------------------------------------------- balances

/**
 * Average daily balance over a series of end-of-day balances (each entry is one day),
 * rounded once. Used by the interest accrual job.
 */
export function averageDailyBalance(
  dailyBalances: readonly Money[],
  mode: RoundingMode = 'HALF_EVEN',
): Money {
  if (dailyBalances.length === 0) {
    throw new InvalidAmountError('At least one daily balance is required');
  }
  const first = dailyBalances[0] as Money;
  const total = Money.sum(dailyBalances, first.currency);
  return total.divideByInteger(dailyBalances.length, mode);
}

/** Weighted variant: days held is explicit, which is what daily accrual actually needs. */
export function weightedAverageBalance(
  entries: readonly { readonly balance: Money; readonly days: number }[],
  mode: RoundingMode = 'HALF_EVEN',
): Money {
  if (entries.length === 0) throw new InvalidAmountError('At least one entry is required');
  const currency = entries[0]!.balance.currency;
  let weighted = Money.zero(currency);
  let totalDays = 0;
  for (const entry of entries) {
    if (!Number.isInteger(entry.days) || entry.days < 0) {
      throw new InvalidAmountError(`days must be a non-negative integer, got ${entry.days}`);
    }
    weighted = weighted.add(entry.balance.multiplyByInteger(entry.days));
    totalDays += entry.days;
  }
  if (totalDays === 0) throw new InvalidAmountError('Total days must be greater than zero');
  return weighted.divideByInteger(totalDays, mode);
}

/** Monthly payment expressed as a percentage of principal, for display. */
export function debtServiceRatio(payment: Money, income: Money): Ratio {
  if (income.isNegativeOrZero) throw new InvalidAmountError('income must be positive');
  return Ratio.of(payment.minor, income.minor);
}

/** "6.5" -> Ratio 65/1000. Percentages arrive from forms and config as strings. */
export function rateFromPercent(percent: string): Ratio {
  return Ratio.fromDecimalString(percent).divideInteger(100);
}
