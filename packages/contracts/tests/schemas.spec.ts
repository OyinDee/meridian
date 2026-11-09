import { describe, expect, it } from 'vitest';
import { Money } from '@meridian/money';
import {
  accountNumberSchema,
  amountSchema,
  bankCodeSchema,
  bvnSchema,
  isoDateSchema,
  moneySchema,
  narrationSchema,
  parseAmountToMinor,
  passwordSchema,
  phoneSchema,
  realtimeEnvelopeSchema,
  registerSchema,
  transferSchema,
} from '../src/index.js';

const UUID = '2f1c9f1e-6b1a-4a3e-9d1f-9c1b2a3d4e5f';
const BENEFICIARY = '9a7b6c5d-4e3f-4a2b-8c1d-0e9f8a7b6c5d';

describe('amountSchema', () => {
  it('accepts naira amounts up to two decimal places', () => {
    const schema = amountSchema('NGN');
    expect(schema.parse('0.01')).toBe('0.01');
    expect(schema.parse('1500')).toBe('1500');
    expect(schema.parse('1500.5')).toBe('1500.5');
    expect(schema.parse('1500.55')).toBe('1500.55');
  });

  it('rejects a third decimal place instead of silently rounding', () => {
    const result = amountSchema('NGN').safeParse('1500.555');
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toMatch(/at most 2 decimal places/i);
  });

  it('rejects zero, negatives, thousands separators and exponent notation', () => {
    const schema = amountSchema('NGN');
    for (const value of ['0', '0.00', '-10', '1,000', '1e3', '']) {
      expect(schema.safeParse(value).success, `${value} should be rejected`).toBe(false);
    }
  });

  it('requires whole units for a zero-decimal currency', () => {
    const schema = amountSchema('JPY');
    expect(schema.parse('1000')).toBe('1000');
    expect(schema.safeParse('1000.5').success).toBe(false);
  });
});

describe('money round-trip', () => {
  it('survives the wire format without losing a kobo', () => {
    const original = Money.fromDecimalString('1234.56', 'NGN');
    const payload = moneySchema.parse(original.toJSON());
    expect(payload.minor).toBe('123456');
    expect(payload.currency).toBe('NGN');
    expect(Money.of(payload.minor, payload.currency).equals(original)).toBe(true);
  });

  it('keeps amounts far beyond Number.MAX_SAFE_INTEGER exact', () => {
    const big = '9007199254740993';
    expect(parseAmountToMinor(`90071992547409930`, 'NGN').minor).toBe(BigInt('9007199254740993000'));
    expect(Money.of(big, 'NGN').minor).toBe(BigInt(big));
  });

  it('rejects a minor value that is not an integer string', () => {
    expect(moneySchema.safeParse({ minor: '12.5', currency: 'NGN' }).success).toBe(false);
  });
});

describe('identity formats', () => {
  it('validates NUBAN account numbers', () => {
    expect(accountNumberSchema.parse(' 0123456789 ')).toBe('0123456789');
    expect(accountNumberSchema.safeParse('123456789').success).toBe(false);
    expect(accountNumberSchema.safeParse('01234567890').success).toBe(false);
  });

  it('validates BVN and Nigerian mobile numbers', () => {
    expect(bvnSchema.safeParse('12345678901').success).toBe(true);
    expect(bvnSchema.safeParse('1234567890').success).toBe(false);

    for (const phone of ['08031234567', '+2348031234567', '09091234567', '07011234567']) {
      expect(phoneSchema.safeParse(phone).success, phone).toBe(true);
    }
    for (const phone of ['0803123456', '080312345678', '08121234567']) {
      // 0812 is not an allocated MTN prefix: [789][01] only.
      expect(phoneSchema.safeParse(phone).success, phone).toBe(false);
    }
  });

  it('only accepts bank codes from the NIBSS list', () => {
    expect(bankCodeSchema.parse('058')).toBe('058');
    expect(bankCodeSchema.safeParse('999').success).toBe(false);
  });

  it('requires a strong password', () => {
    expect(passwordSchema.safeParse('Correct-Horse9').success).toBe(true);
    expect(passwordSchema.safeParse('short1A').success).toBe(false);
    expect(passwordSchema.safeParse('alllowercase123').success).toBe(false);
    expect(passwordSchema.safeParse('ALLUPPERCASE123').success).toBe(false);
    expect(passwordSchema.safeParse('NoDigitsHereAtAll').success).toBe(false);
  });

  it('validates calendar dates', () => {
    expect(isoDateSchema.safeParse('1994-03-17').success).toBe(true);
    expect(isoDateSchema.safeParse('2024-13-01').success).toBe(false);
    expect(isoDateSchema.safeParse('17/03/1994').success).toBe(false);
  });

  it('caps the narration length', () => {
    expect(narrationSchema.safeParse('Rent for March').success).toBe(true);
    expect(narrationSchema.safeParse('x'.repeat(129)).success).toBe(false);
  });
});

describe('registerSchema', () => {
  it('accepts a complete Nigerian customer registration', () => {
    const result = registerSchema.safeParse({
      email: 'ada@example.ng',
      password: 'Correct-Horse9',
      firstName: 'Ada',
      lastName: 'Obi',
      phone: '08031234567',
      bvn: '12345678901',
      dateOfBirth: '1994-03-17',
    });
    expect(result.success).toBe(true);
  });

  it('reports every invalid field at once', () => {
    const result = registerSchema.safeParse({
      email: 'not-an-email',
      password: 'weak',
      firstName: '',
      lastName: '',
      phone: '12345',
      bvn: '123',
      dateOfBirth: 'yesterday',
    });
    expect(result.success).toBe(false);
    const paths = result.error?.issues.map((issue) => issue.path.join('.')) ?? [];
    expect(paths).toEqual(
      expect.arrayContaining(['email', 'password', 'firstName', 'lastName', 'phone', 'bvn', 'dateOfBirth']),
    );
  });
});

describe('transferSchema', () => {
  const base = { fromAccountId: UUID, amount: '25000.00' };

  it('accepts a saved beneficiary', () => {
    const result = transferSchema.safeParse({ ...base, beneficiaryId: BENEFICIARY });
    expect(result.success).toBe(true);
  });

  it('accepts a raw account number plus bank code', () => {
    const result = transferSchema.safeParse({
      ...base,
      toAccountNumber: '0123456789',
      toBankCode: '058',
      narration: 'School fees',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a transfer with no destination', () => {
    const result = transferSchema.safeParse(base);
    expect(result.success).toBe(false);
  });

  it('rejects a transfer with two destinations', () => {
    const result = transferSchema.safeParse({
      ...base,
      beneficiaryId: BENEFICIARY,
      toAccountNumber: '0123456789',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an account number without a bank code', () => {
    const result = transferSchema.safeParse({ ...base, toAccountNumber: '0123456789' });
    expect(result.success).toBe(false);
  });

  it('rejects a non-UUID source account', () => {
    expect(transferSchema.safeParse({ fromAccountId: 'acct-1', amount: '10', beneficiaryId: BENEFICIARY }).success).toBe(
      false,
    );
  });
});

describe('realtimeEnvelopeSchema', () => {
  it('accepts a well-formed event frame', () => {
    const result = realtimeEnvelopeSchema.safeParse({
      sequence: 42,
      type: 'balance.updated',
      emittedAt: new Date().toISOString(),
      payload: { accountId: UUID },
    });
    expect(result.success).toBe(true);
  });

  it('rejects a negative sequence, which would break Last-Event-ID replay', () => {
    const result = realtimeEnvelopeSchema.safeParse({
      sequence: -1,
      type: 'balance.updated',
      emittedAt: new Date().toISOString(),
      payload: {},
    });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown event type', () => {
    const result = realtimeEnvelopeSchema.safeParse({
      sequence: 1,
      type: 'account.exploded',
      emittedAt: new Date().toISOString(),
      payload: {},
    });
    expect(result.success).toBe(false);
  });
});
