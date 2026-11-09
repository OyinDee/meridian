import {
  CurrencyCode,
  DEFAULT_CURRENCY,
  Money,
  SUPPORTED_CURRENCIES,
  getCurrency,
} from '@meridian/money';
import { z } from 'zod';
import { findBank } from './banks.js';
import {
  ACCOUNT_TYPES,
  BENEFICIARY_TYPES,
  CARD_BRANDS,
  DAY_COUNT_CONVENTIONS,
  INTEREST_COMPOUNDING_FREQUENCIES,
  JOURNAL_KINDS,
  NARRATION_MAX_LENGTH,
  REVIEW_STATUSES,
  REALTIME_EVENTS,
  RISK_DECISIONS,
  RISK_RULE_TYPES,
  SCHEDULE_FREQUENCIES,
  TRANSFER_CHANNELS,
} from './enums.js';

/**
 * Request and response shapes, validated identically on both sides of the wire.
 * The API runs these through a zod pipe; the web app uses the same schemas for
 * react-hook-form resolvers, so a form and its endpoint can never disagree.
 */

// ------------------------------------------------------------- primitives

export const currencySchema = z.enum(SUPPORTED_CURRENCIES);

/** A 10-digit NUBAN, the only account-number format Nigerian banks issue. */
export const accountNumberSchema = z
  .string()
  .trim()
  .regex(/^\d{10}$/, 'Account number must be exactly 10 digits');

export const bankCodeSchema = z
  .string()
  .trim()
  .refine((code) => findBank(code) !== undefined, 'Choose a bank from the list');

/** Bank Verification Number: 11 digits, issued by NIBSS. */
export const bvnSchema = z.string().trim().regex(/^\d{11}$/, 'BVN must be exactly 11 digits');

export const phoneSchema = z
  .string()
  .trim()
  .regex(/^(?:\+234|0)[789][01]\d{8}$/, 'Enter a Nigerian mobile number, for example 08031234567');

export const emailSchema = z.email('Enter a valid email address').max(254);

export const passwordSchema = z
  .string()
  .min(12, 'Use at least 12 characters')
  .max(128, 'Use at most 128 characters')
  .regex(/[a-z]/, 'Include a lowercase letter')
  .regex(/[A-Z]/, 'Include an uppercase letter')
  .regex(/\d/, 'Include a number');

export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD')
  .refine((value) => !Number.isNaN(Date.parse(value)), 'Enter a real calendar date');

export const narrationSchema = z
  .string()
  .trim()
  .max(NARRATION_MAX_LENGTH, `Keep the narration under ${NARRATION_MAX_LENGTH} characters`);

/** Client-supplied key that makes a retried request idempotent. */
export const idempotencyKeySchema = z
  .string()
  .trim()
  .min(8, 'Idempotency keys are at least 8 characters')
  .max(128, 'Idempotency keys are at most 128 characters');

export const uuidSchema = z.uuid('Expected a UUID');

// ------------------------------------------------------------- money

/**
 * A decimal amount as typed by a human. Validation is deliberately strict about
 * precision: a request for `NGN 10.005` is rejected rather than silently rounded,
 * because the caller's intent is ambiguous.
 */
export function amountSchema(currency: CurrencyCode = DEFAULT_CURRENCY) {
  const scale = getCurrency(currency).scale;
  const pattern = scale === 0 ? /^\d+$/ : new RegExp(`^\\d+(\\.\\d{1,${scale}})?$`);
  return z
    .string()
    .trim()
    .regex(
      pattern,
      scale === 0
        ? `${currency} amounts are whole numbers`
        : `Use at most ${scale} decimal places`,
    )
    .refine((value) => Number(value) > 0, 'Enter an amount greater than zero');
}

/** Wire format for a money value: minor units as a string, plus the currency. */
export const moneySchema = z.object({
  minor: z.string().regex(/^-?\d+$/, 'Minor units must be an integer string'),
  currency: currencySchema,
  amount: z.string().optional(),
});

export type MoneyPayload = z.infer<typeof moneySchema>;

export function moneyFromPayload(payload: MoneyPayload): Money {
  return Money.of(payload.minor, payload.currency);
}

export function moneyToPayload(money: Money): MoneyPayload {
  return money.toJSON();
}

/** Amount as a decimal string in the given currency, for request bodies. */
export function parseAmountToMinor(amount: string, currency: CurrencyCode): Money {
  return Money.fromDecimalString(amount, currency);
}

// ------------------------------------------------------------- identity

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  firstName: z.string().trim().min(1, 'Enter your first name').max(60),
  lastName: z.string().trim().min(1, 'Enter your last name').max(60),
  phone: phoneSchema,
  bvn: bvnSchema,
  dateOfBirth: isoDateSchema,
});
export type RegisterRequest = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema.describe('email'),
  password: z.string().min(1, 'Enter your password').max(128),
});
export type LoginRequest = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({
  refreshToken: z.string().min(20, 'Refresh token is too short').max(512),
});
export type RefreshRequest = z.infer<typeof refreshSchema>;

export const totpCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'Enter the 6-digit code from your authenticator app');

export const mfaVerifySchema = z.object({ code: totpCodeSchema });
export const mfaDisableSchema = z.object({
  code: totpCodeSchema,
  password: z.string().min(1).max(128),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: passwordSchema,
});

// ------------------------------------------------------------- accounts

export const openAccountSchema = z.object({
  type: z.enum(['CURRENT', 'SAVINGS', 'DOMICILIARY']),
  currency: currencySchema.default(DEFAULT_CURRENCY),
  nickname: z.string().trim().max(40).optional(),
});
export type OpenAccountRequest = z.infer<typeof openAccountSchema>;

export const accountQuerySchema = z.object({
  type: z.enum(ACCOUNT_TYPES).optional(),
  currency: currencySchema.optional(),
  includeClosed: z.coerce.boolean().default(false),
});

export const accountIdParamSchema = z.object({ accountId: uuidSchema });

// ------------------------------------------------------------- transfers

/**
 * Either send to a saved beneficiary, or to a raw account number + bank.
 * The refine enforces exactly one of the two paths.
 */
export const transferSchema = z
  .object({
    fromAccountId: uuidSchema,
    amount: z.string().trim(),
    currency: currencySchema.optional(),
    beneficiaryId: uuidSchema.optional(),
    toAccountNumber: accountNumberSchema.optional(),
    toBankCode: bankCodeSchema.optional(),
    narration: narrationSchema.optional(),
    channel: z.enum(TRANSFER_CHANNELS).optional(),
    /** TOTP code, required when the transfer is above the step-up threshold. */
    mfaCode: totpCodeSchema.optional(),
  })
  .refine(
    (value) =>
      value.beneficiaryId !== undefined ||
      (value.toAccountNumber !== undefined && value.toBankCode !== undefined),
    {
      message: 'Choose a saved beneficiary or provide an account number and bank',
      path: ['beneficiaryId'],
    },
  )
  .refine(
    (value) =>
      !(value.beneficiaryId !== undefined && value.toAccountNumber !== undefined),
    { message: 'Send to a beneficiary or to an account number, not both', path: ['toAccountNumber'] },
  );
export type TransferRequest = z.infer<typeof transferSchema>;

export const depositSchema = z.object({
  accountId: uuidSchema,
  amount: z.string().trim(),
  currency: currencySchema.optional(),
  narration: narrationSchema.optional(),
  /** Where the money came in from, for the audit trail. */
  source: z.enum(['CASH', 'CHEQUE', 'TRANSFER_IN', 'MOBILE_MONEY', 'ADJUSTMENT']).default('TRANSFER_IN'),
});
export type DepositRequest = z.infer<typeof depositSchema>;

export const withdrawalSchema = z.object({
  accountId: uuidSchema,
  amount: z.string().trim(),
  currency: currencySchema.optional(),
  narration: narrationSchema.optional(),
  destination: z.enum(['CASH', 'ATM', 'TRANSFER_OUT', 'MOBILE_MONEY']).default('CASH'),
});
export type WithdrawalRequest = z.infer<typeof withdrawalSchema>;

export const reverseTransferSchema = z.object({
  reason: z.string().trim().min(4, 'Give a reason for the reversal').max(200),
});

export const refundTransferSchema = z.object({
  amount: z.string().trim().optional(),
  reason: z.string().trim().min(4, 'Give a reason for the refund').max(200),
});

// ------------------------------------------------------------- ledger

export const transactionQuerySchema = z.object({
  accountId: uuidSchema.optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  direction: z.enum(['DEBIT', 'CREDIT']).optional(),
  kind: z.enum(JOURNAL_KINDS).optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  minAmount: z.string().trim().optional(),
  maxAmount: z.string().trim().optional(),
  search: z.string().trim().max(80).optional(),
});
export type TransactionQuery = z.infer<typeof transactionQuerySchema>;

export const statementQuerySchema = z.object({
  accountId: uuidSchema,
  from: isoDateSchema,
  to: isoDateSchema,
  format: z.enum(['json', 'csv', 'pdf']).default('json'),
});

// ------------------------------------------------------------- beneficiaries

export const beneficiarySchema = z.object({
  name: z.string().trim().min(2, 'Enter the beneficiary name').max(80),
  accountNumber: accountNumberSchema,
  bankCode: bankCodeSchema,
  type: z.enum(BENEFICIARY_TYPES).default('NIP'),
  nickname: z.string().trim().max(40).optional(),
});
export type BeneficiaryRequest = z.infer<typeof beneficiarySchema>;

/** Name enquiry, as the NIP rails do before a transfer is accepted. */
export const nameEnquirySchema = z.object({
  accountNumber: accountNumberSchema,
  bankCode: bankCodeSchema,
});

// ------------------------------------------------------------- limits / risk

export const setLimitSchema = z.object({
  window: z.enum(['PER_TRANSACTION', 'DAILY', 'MONTHLY']),
  amount: z.string().trim(),
});

export const riskRuleSchema = z.object({
  name: z.string().trim().min(3).max(80),
  type: z.enum(RISK_RULE_TYPES),
  enabled: z.boolean().default(true),
  priority: z.coerce.number().int().min(0).max(1000).default(100),
  decision: z.enum(RISK_DECISIONS),
  /** Rule-specific parameters, validated per `type` in the API's rule compiler. */
  params: z.record(z.string(), z.unknown()).default({}),
});
export type RiskRuleRequest = z.infer<typeof riskRuleSchema>;

export const reviewDecisionSchema = z.object({
  status: z.enum(REVIEW_STATUSES).exclude(['OPEN']),
  note: z.string().trim().max(500).optional(),
});

// ------------------------------------------------------------- cards

export const issueCardSchema = z.object({
  accountId: uuidSchema,
  brand: z.enum(CARD_BRANDS).default('VERVE'),
  dailyLimit: z.string().trim().optional(),
});

export const cardAuthorizationSchema = z.object({
  amount: z.string().trim(),
  merchant: z.string().trim().min(1).max(80),
  merchantCategory: z.string().trim().max(20).optional(),
  channel: z.enum(['POS', 'ATM', 'WEB', 'MOBILE']).default('POS'),
});

export const cardCaptureSchema = z.object({ amount: z.string().trim() });

// ------------------------------------------------------------- loans / interest

export const loanApplicationSchema = z.object({
  accountId: uuidSchema,
  amount: z.string().trim(),
  termMonths: z.coerce.number().int().min(1).max(360),
  purpose: z.string().trim().min(4).max(200),
});
export type LoanApplicationRequest = z.infer<typeof loanApplicationSchema>;

export const loanSimulationSchema = loanApplicationSchema.pick({ amount: true, termMonths: true });
export type LoanSimulationRequest = z.infer<typeof loanSimulationSchema>;

export const loanPaymentSchema = z.object({
  amount: z.string().trim().optional(),
  /** Pay the next instalment, or settle everything outstanding. */
  mode: z.enum(['INSTALMENT', 'FULL_PAYOFF']).default('INSTALMENT'),
});

export const interestRateSchema = z.object({
  product: z.enum(['SAVINGS', 'CURRENT', 'LOAN']),
  annualRate: z.string().trim(),
  compounding: z.enum(INTEREST_COMPOUNDING_FREQUENCIES),
  dayCount: z.enum(DAY_COUNT_CONVENTIONS),
  effectiveFrom: isoDateSchema,
});

// ------------------------------------------------------------- fx

export const fxQuoteSchema = z.object({
  from: currencySchema,
  to: currencySchema,
  amount: z.string().trim(),
});
export type FxQuoteRequest = z.infer<typeof fxQuoteSchema>;

export const fxExecuteSchema = z.object({
  quoteId: uuidSchema,
  fromAccountId: uuidSchema,
  toAccountId: uuidSchema.optional(),
  idempotencyKey: idempotencyKeySchema.optional(),
});

// ------------------------------------------------------------- schedules

export const scheduledTransferSchema = z.object({
  fromAccountId: uuidSchema,
  beneficiaryId: uuidSchema,
  amount: z.string().trim(),
  narration: narrationSchema.optional(),
  frequency: z.enum(SCHEDULE_FREQUENCIES),
  startsOn: isoDateSchema,
  endsOn: isoDateSchema.optional(),
});

// ------------------------------------------------------------- real time

export const balanceUpdatedPayloadSchema = z.object({
  accountId: uuidSchema,
  currency: currencySchema,
  balance: moneySchema,
  available: moneySchema,
  version: z.number().int(),
});
export type BalanceUpdatedPayload = z.infer<typeof balanceUpdatedPayloadSchema>;

export const transactionPostedPayloadSchema = z.object({
  accountId: uuidSchema,
  journalTransactionId: uuidSchema,
  kind: z.enum(JOURNAL_KINDS),
  direction: z.enum(['DEBIT', 'CREDIT']),
  amount: moneySchema,
  balanceAfter: moneySchema,
  narration: z.string(),
  postedAt: z.string(),
});
export type TransactionPostedPayload = z.infer<typeof transactionPostedPayloadSchema>;

export const transferStateChangedPayloadSchema = z.object({
  transferId: uuidSchema,
  status: z.string(),
  previousStatus: z.string().nullable(),
  reason: z.string().nullable(),
});
export type TransferStateChangedPayload = z.infer<typeof transferStateChangedPayloadSchema>;

export const notificationCreatedPayloadSchema = z.object({
  notificationId: uuidSchema,
  type: z.string(),
  title: z.string(),
  body: z.string(),
  createdAt: z.string(),
});
export type NotificationCreatedPayload = z.infer<typeof notificationCreatedPayloadSchema>;

/**
 * Every SSE frame carries a monotonic `sequence`. A client that reconnects with
 * `Last-Event-ID: <sequence>` gets exactly the events it missed.
 */
export const realtimeEnvelopeSchema = z.object({
  sequence: z.number().int().nonnegative(),
  type: z.enum(REALTIME_EVENTS),
  emittedAt: z.string(),
  payload: z.unknown(),
});
export type RealtimeEnvelope = z.infer<typeof realtimeEnvelopeSchema>;

// ------------------------------------------------------------- pagination

export function cursorPageSchema<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    items: z.array(item),
    nextCursor: z.string().nullable(),
    hasMore: z.boolean(),
  });
}

export type CursorPage<T> = {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
};
