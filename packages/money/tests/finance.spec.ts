import { describe, expect, it } from 'vitest';
import { InvalidAmountError } from '../src/errors.js';
import {
  addDays,
  addMonths,
  accruedInterest,
  amortizationSchedule,
  annuityPayment,
  averageDailyBalance,
  dayCountFraction,
  daysBetween,
  daysInYear,
  debtServiceRatio,
  effectiveAnnualRate,
  isLeapYear,
  outstandingBalance,
  periodicRate,
  rateFromPercent,
  thirty360Days,
  utcDate,
  weightedAverageBalance,
} from '../src/finance.js';
import { Money } from '../src/money.js';
import { Ratio } from '../src/ratio.js';

describe('date helpers', () => {
  it('counts actual days between dates', () => {
    expect(daysBetween(utcDate(2024, 1, 1), utcDate(2024, 2, 1))).toBe(31);
    expect(daysBetween(utcDate(2023, 1, 1), utcDate(2024, 1, 1))).toBe(365);
    expect(daysBetween(utcDate(2024, 1, 1), utcDate(2025, 1, 1))).toBe(366);
    expect(daysBetween(utcDate(2024, 3, 1), utcDate(2024, 2, 1))).toBe(-29);
    expect(daysBetween(utcDate(2024, 1, 1), utcDate(2024, 1, 1))).toBe(0);
  });

  it('steps days and months with end-of-month clamping', () => {
    expect(addDays(utcDate(2024, 1, 1), 31).toISOString().slice(0, 10)).toBe('2024-02-01');
    // 31 Jan + 1 month in a leap year lands on 29 Feb.
    expect(addMonths(utcDate(2024, 1, 31), 1).toISOString().slice(0, 10)).toBe('2024-02-29');
    expect(addMonths(utcDate(2023, 1, 31), 1).toISOString().slice(0, 10)).toBe('2023-02-28');
    expect(addMonths(utcDate(2024, 12, 15), 1).toISOString().slice(0, 10)).toBe('2025-01-15');
    expect(addMonths(utcDate(2024, 1, 15), 12).toISOString().slice(0, 10)).toBe('2025-01-15');
    expect(addMonths(utcDate(2024, 3, 31), -1).toISOString().slice(0, 10)).toBe('2024-02-29');
  });

  it('knows leap years', () => {
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(2100)).toBe(false);
    expect(isLeapYear(2000)).toBe(true);
    expect(daysInYear(utcDate(2024, 6, 1))).toBe(366);
    expect(daysInYear(utcDate(2025, 6, 1))).toBe(365);
  });

  it('computes 30/360 day counts', () => {
    // 31 Jan -> 31 Mar: both clamped to 30, so 60 days.
    expect(thirty360Days(utcDate(2024, 1, 31), utcDate(2024, 3, 31))).toBe(60);
    expect(thirty360Days(utcDate(2024, 1, 1), utcDate(2024, 12, 31))).toBe(359);
    expect(thirty360Days(utcDate(2024, 1, 15), utcDate(2024, 2, 15))).toBe(30);
  });
});

describe('dayCountFraction', () => {
  it('uses the requested convention', () => {
    const start = utcDate(2024, 1, 1);
    const end = utcDate(2024, 2, 1);

    expect(dayCountFraction('ACT/365', start, end).equals(Ratio.of(31n, 365n))).toBe(true);
    expect(dayCountFraction('ACT/360', start, end).equals(Ratio.of(31n, 360n))).toBe(true);
    expect(dayCountFraction('30/360', start, end).equals(Ratio.of(30n, 360n))).toBe(true);
    expect(dayCountFraction('ACT/365', start, start).isZero).toBe(true);
  });

  it('prices ACT/ACT across a leap year by calendar segment', () => {
    const fraction = dayCountFraction('ACT/ACT', utcDate(2023, 7, 1), utcDate(2024, 7, 1));
    const expected = Ratio.of(184n, 365n).add(Ratio.of(182n, 366n));
    expect(fraction.equals(expected)).toBe(true);
    // A full calendar year is exactly one year under ACT/ACT.
    expect(dayCountFraction('ACT/ACT', utcDate(2024, 1, 1), utcDate(2025, 1, 1)).equals(Ratio.ONE)).toBe(true);
    expect(dayCountFraction('ACT/ACT', utcDate(2023, 1, 1), utcDate(2024, 1, 1)).equals(Ratio.ONE)).toBe(true);
  });
});

describe('rates', () => {
  it('converts nominal annual to periodic', () => {
    const monthly = periodicRate(Ratio.fromDecimalString('0.06'), 12);
    expect(monthly.numerator).toBe(1n);
    expect(monthly.denominator).toBe(200n);
    expect(() => periodicRate(Ratio.fromDecimalString('0.06'), 0)).toThrow(InvalidAmountError);
  });

  it('reports the effective annual rate from compounding', () => {
    expect(effectiveAnnualRate(Ratio.fromDecimalString('0.06'), 12).toDecimalString(6)).toBe(
      '0.061678',
    );
    expect(effectiveAnnualRate(Ratio.fromDecimalString('0.06'), 1).toDecimalString(6)).toBe(
      '0.060000',
    );
  });

  it('parses percentage text', () => {
    expect(rateFromPercent('6.5').equals(Ratio.of(65n, 1000n))).toBe(true);
  });

  it('accrues interest with a single rounding', () => {
    // 1,000.00 at 5% for 30 days on an ACT/365 basis -> 4.1095... -> 4.11
    const interest = accruedInterest(
      Money.fromDecimalString('1000.00', 'USD'),
      Ratio.fromDecimalString('0.05'),
      dayCountFraction('ACT/365', utcDate(2024, 1, 1), utcDate(2024, 1, 31)),
    );
    expect(interest.minor).toBe(411n);

    const down = accruedInterest(
      Money.fromDecimalString('1000.00', 'USD'),
      Ratio.fromDecimalString('0.05'),
      dayCountFraction('ACT/365', utcDate(2024, 1, 1), utcDate(2024, 1, 31)),
      'DOWN',
    );
    expect(down.minor).toBe(410n);
  });
});

describe('annuityPayment', () => {
  it('matches the standard amortisation formula', () => {
    // 100,000 over 30 years at 6% nominal, monthly: 599.55
    const payment = annuityPayment(
      Money.fromDecimalString('100000.00', 'USD'),
      periodicRate(Ratio.fromDecimalString('0.06'), 12),
      360,
    );
    expect(payment.minor).toBe(59955n);
  });

  it('matches a short consumer loan', () => {
    // 12,000 over 12 months at 12% nominal, monthly: 1066.19
    const payment = annuityPayment(
      Money.fromDecimalString('12000.00', 'USD'),
      periodicRate(Ratio.fromDecimalString('0.12'), 12),
      12,
    );
    expect(payment.minor).toBe(106619n);
  });

  it('degenerates to simple division at a zero rate', () => {
    expect(annuityPayment(Money.fromDecimalString('1200.00', 'USD'), Ratio.ZERO, 12).minor).toBe(
      10000n,
    );
  });

  it('rejects impossible parameters', () => {
    expect(() => annuityPayment(Money.of(100, 'USD'), Ratio.ZERO, 0)).toThrow(InvalidAmountError);
    expect(() => annuityPayment(Money.zero('USD'), Ratio.ZERO, 12)).toThrow(InvalidAmountError);
    expect(() => annuityPayment(Money.of(-100, 'USD'), Ratio.ZERO, 12)).toThrow(InvalidAmountError);
  });
});

describe('amortizationSchedule', () => {
  const schedule = amortizationSchedule({
    principal: Money.fromDecimalString('12000.00', 'USD'),
    annualRate: Ratio.fromDecimalString('0.12'),
    periods: 12,
    periodsPerYear: 12,
    firstDueDate: utcDate(2024, 2, 1),
  });

  it('closes the balance to exactly zero', () => {
    const last = schedule.installments.at(-1);
    expect(last?.closingBalance.minor).toBe(0n);
    expect(schedule.installments).toHaveLength(12);
  });

  it('keeps the accounting identity total paid = principal + interest', () => {
    expect(schedule.totalPaid.minor).toBe(schedule.totalPrincipal.minor + schedule.totalInterest.minor);
    expect(schedule.totalPrincipal.minor).toBe(schedule.principal.minor);
    const summed = schedule.installments.reduce((total, i) => total + i.principal.minor, 0n);
    expect(summed).toBe(schedule.principal.minor);
  });

  it('splits every instalment into interest plus principal', () => {
    for (const instalment of schedule.installments) {
      expect(instalment.payment.minor).toBe(instalment.interest.minor + instalment.principal.minor);
      expect(instalment.openingBalance.minor - instalment.principal.minor).toBe(
        instalment.closingBalance.minor,
      );
    }
  });

  it('dates instalments one month apart', () => {
    expect(schedule.installments[0]?.dueDate.toISOString().slice(0, 10)).toBe('2024-02-01');
    expect(schedule.installments[11]?.dueDate.toISOString().slice(0, 10)).toBe('2025-01-01');
  });

  it('reports the outstanding balance at any point', () => {
    expect(outstandingBalance(schedule, 0).minor).toBe(1200000n);
    expect(outstandingBalance(schedule, 6).minor).toBe(schedule.installments[5]?.closingBalance.minor);
    expect(outstandingBalance(schedule, 99).minor).toBe(0n);
  });

  it('absorbs a fixed over-payment and finishes early', () => {
    const early = amortizationSchedule({
      principal: Money.fromDecimalString('12000.00', 'USD'),
      annualRate: Ratio.fromDecimalString('0.12'),
      periods: 12,
      periodsPerYear: 12,
      firstDueDate: utcDate(2024, 2, 1),
      fixedPayment: Money.fromDecimalString('2000.00', 'USD'),
    });
    expect(early.installments.length).toBeLessThan(12);
    expect(early.installments.at(-1)?.closingBalance.minor).toBe(0n);
  });

  it('refuses payments that would negatively amortise', () => {
    expect(() =>
      amortizationSchedule({
        principal: Money.fromDecimalString('10000.00', 'USD'),
        annualRate: Ratio.fromDecimalString('0.24'),
        periods: 24,
        periodsPerYear: 12,
        firstDueDate: utcDate(2024, 2, 1),
        fixedPayment: Money.fromDecimalString('10.00', 'USD'),
      }),
    ).toThrow(InvalidAmountError);
  });

  it('supports quarterly and annual periods', () => {
    const quarterly = amortizationSchedule({
      principal: Money.fromDecimalString('10000.00', 'USD'),
      annualRate: Ratio.fromDecimalString('0.08'),
      periods: 4,
      periodsPerYear: 4,
      firstDueDate: utcDate(2024, 3, 31),
    });
    expect(quarterly.installments).toHaveLength(4);
    expect(quarterly.installments[0]?.dueDate.toISOString().slice(0, 10)).toBe('2024-03-31');
    expect(quarterly.installments[3]?.dueDate.toISOString().slice(0, 10)).toBe('2024-12-31');
    expect(quarterly.installments.at(-1)?.closingBalance.minor).toBe(0n);
  });

  it('rejects frequencies that cannot step by whole months', () => {
    expect(() =>
      amortizationSchedule({
        principal: Money.of(100000, 'USD'),
        annualRate: Ratio.fromDecimalString('0.05'),
        periods: 5,
        periodsPerYear: 5,
        firstDueDate: utcDate(2024, 1, 1),
      }),
    ).toThrow(InvalidAmountError);
  });
});

describe('balance averages', () => {
  it('averages daily balances', () => {
    const average = averageDailyBalance([
      Money.fromDecimalString('100.00', 'USD'),
      Money.fromDecimalString('200.00', 'USD'),
      Money.fromDecimalString('300.00', 'USD'),
    ]);
    expect(average.minor).toBe(20000n);
  });

  it('weights balances by days held', () => {
    const weighted = weightedAverageBalance([
      { balance: Money.fromDecimalString('1000.00', 'USD'), days: 10 },
      { balance: Money.fromDecimalString('0.00', 'USD'), days: 20 },
    ]);
    // 10,000 over 30 days -> 333.33
    expect(weighted.minor).toBe(33333n);
  });

  it('guards against empty or zero-length input', () => {
    expect(() => averageDailyBalance([])).toThrow(InvalidAmountError);
    expect(() => weightedAverageBalance([])).toThrow(InvalidAmountError);
    expect(() =>
      weightedAverageBalance([{ balance: Money.of(100, 'USD'), days: 0 }]),
    ).toThrow(InvalidAmountError);
  });

  it('computes a debt service ratio', () => {
    const ratio = debtServiceRatio(
      Money.fromDecimalString('1200.00', 'USD'),
      Money.fromDecimalString('4000.00', 'USD'),
    );
    expect(ratio.equals(Ratio.of(3n, 10n))).toBe(true);
    expect(() => debtServiceRatio(Money.of(1, 'USD'), Money.zero('USD'))).toThrow(InvalidAmountError);
  });
});
