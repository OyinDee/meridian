/**
 * Domain vocabulary shared by the API and the web app.
 *
 * These are `as const` tuples rather than TS enums: the values survive the wire,
 * so a `switch` in the API and a lookup table in the UI can never disagree.
 */

// ------------------------------------------------------------------ accounts

export const ACCOUNT_TYPES = [
  'CURRENT', // everyday naira account (NUBAN)
  'SAVINGS', // interest-bearing, may carry a minimum balance
  'DOMICILIARY', // foreign-currency account
  'LOAN',
  'CREDIT_CARD',
  'SUSPENSE', // bank-internal clearing account, never customer-facing
  'INTERNAL', // bank's own GL accounts (fees, interest expense, FX position)
] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const ACCOUNT_STATUSES = ['PENDING', 'ACTIVE', 'DORMANT', 'FROZEN', 'CLOSED'] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

/** How a customer-facing account is labelled in the UI. */
export const CUSTOMER_ACCOUNT_TYPES: readonly AccountType[] = [
  'CURRENT',
  'SAVINGS',
  'DOMICILIARY',
  'LOAN',
  'CREDIT_CARD',
];

export const LEDGER_DIRECTIONS = ['DEBIT', 'CREDIT'] as const;
export type LedgerDirection = (typeof LEDGER_DIRECTIONS)[number];

/**
 * Normal balance of an account: which side increases it. Customer deposit accounts
 * are a liability of the bank, so they increase on the credit side.
 */
export const NORMAL_BALANCES = ['DEBIT', 'CREDIT'] as const;
export type NormalBalance = (typeof NORMAL_BALANCES)[number];

// -------------------------------------------------------------------- ledger

export const JOURNAL_KINDS = [
  'DEPOSIT',
  'WITHDRAWAL',
  'INTERNAL_TRANSFER',
  'EXTERNAL_TRANSFER',
  'FEE',
  'INTEREST_ACCRUAL',
  'INTEREST_CAPITALISATION',
  'FX_CONVERSION',
  'LOAN_DISBURSEMENT',
  'LOAN_REPAYMENT',
  'CARD_AUTHORIZATION',
  'CARD_CAPTURE',
  'HOLD_RELEASE',
  'SETTLEMENT',
  'REVERSAL',
  'ADJUSTMENT',
  'OPENING_BALANCE',
] as const;
export type JournalKind = (typeof JOURNAL_KINDS)[number];

export const JOURNAL_STATUSES = ['POSTED', 'REVERSED'] as const;
export type JournalStatus = (typeof JOURNAL_STATUSES)[number];

// ----------------------------------------------------------------- transfers

/**
 * Lifecycle of a payment intent. Transitions are validated in one place
 * (`transferStateMachine` in the API) so an illegal jump is impossible.
 */
export const TRANSFER_STATUSES = [
  'PENDING',
  'RISK_REVIEW',
  'BLOCKED',
  'PROCESSING',
  'SETTLED',
  'FAILED',
  'REVERSED',
  'REFUNDED',
] as const;
export type TransferStatus = (typeof TRANSFER_STATUSES)[number];

export const TERMINAL_TRANSFER_STATUSES: readonly TransferStatus[] = [
  'BLOCKED',
  'SETTLED',
  'FAILED',
  'REVERSED',
  'REFUNDED',
];

/**
 * Payment rails. NIP is NIBSS Instant Payments, the Nigerian real-time interbank
 * scheme; NEFT (the older batch scheme) is included because it settles later, which
 * makes the settlement worker worth having.
 */
export const TRANSFER_CHANNELS = [
  'INTERNAL', // Meridian-to-Meridian, settles instantly
  'NIP', // instant interbank
  'NEFT', // next-day interbank batch
  'STANDING_ORDER',
  'CARD',
] as const;
export type TransferChannel = (typeof TRANSFER_CHANNELS)[number];

export const TRANSFER_DIRECTIONS = ['DEBIT', 'CREDIT'] as const;
export type TransferDirection = (typeof TRANSFER_DIRECTIONS)[number];

export const NARRATION_MAX_LENGTH = 128;

// -------------------------------------------------------------------- holds

export const HOLD_STATUSES = ['ACTIVE', 'CAPTURED', 'RELEASED', 'EXPIRED'] as const;
export type HoldStatus = (typeof HOLD_STATUSES)[number];

// ------------------------------------------------------------------- limits

export const LIMIT_WINDOWS = ['PER_TRANSACTION', 'DAILY', 'MONTHLY'] as const;
export type LimitWindow = (typeof LIMIT_WINDOWS)[number];

// --------------------------------------------------------------------- risk

export const RISK_DECISIONS = ['ALLOW', 'REVIEW', 'BLOCK'] as const;
export type RiskDecision = (typeof RISK_DECISIONS)[number];

export const RISK_RULE_TYPES = [
  'AMOUNT_ABOVE',
  'VELOCITY_COUNT',
  'VELOCITY_SUM',
  'NEW_BENEFICIARY',
  'COUNTRY_MISMATCH',
  'ODD_HOUR',
  'BALANCE_RATIO',
  'ANOMALY_ZSCORE',
] as const;
export type RiskRuleType = (typeof RISK_RULE_TYPES)[number];

export const REVIEW_STATUSES = ['OPEN', 'APPROVED', 'REJECTED', 'ESCALATED'] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

// ------------------------------------------------------------------ identity

export const USER_STATUSES = ['ACTIVE', 'SUSPENDED', 'CLOSED'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const KYC_STATUSES = ['UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED'] as const;
export type KycStatus = (typeof KYC_STATUSES)[number];

export const ROLES = ['CUSTOMER', 'TELLER', 'OFFICER', 'ADMIN', 'AUDITOR'] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  'account:read:own',
  'account:read:any',
  'transfer:create',
  'transfer:approve',
  'ledger:read',
  'risk:read',
  'risk:decide',
  'user:manage',
  'audit:read',
  'reconciliation:run',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  CUSTOMER: ['account:read:own', 'transfer:create'],
  TELLER: ['account:read:any', 'transfer:create'],
  OFFICER: ['account:read:any', 'transfer:create', 'transfer:approve', 'risk:read'],
  ADMIN: [
    'account:read:any',
    'transfer:create',
    'transfer:approve',
    'ledger:read',
    'risk:read',
    'risk:decide',
    'user:manage',
    'audit:read',
    'reconciliation:run',
  ],
  AUDITOR: ['account:read:any', 'ledger:read', 'risk:read', 'audit:read'],
};

// ------------------------------------------------------------------ products

export const LOAN_STATUSES = [
  'PENDING',
  'APPROVED',
  'DISBURSED',
  'REPAYING',
  'SETTLED',
  'DEFAULTED',
  'WRITTEN_OFF',
] as const;
export type LoanStatus = (typeof LOAN_STATUSES)[number];

export const CARD_STATUSES = ['PENDING', 'ACTIVE', 'FROZEN', 'EXPIRED', 'CANCELLED'] as const;
export type CardStatus = (typeof CARD_STATUSES)[number];

export const CARD_BRANDS = ['VERVE', 'MASTERCARD', 'VISA'] as const;
export type CardBrand = (typeof CARD_BRANDS)[number];

export const SCHEDULE_FREQUENCIES = ['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUALLY'] as const;
export type ScheduleFrequency = (typeof SCHEDULE_FREQUENCIES)[number];

export const BENEFICIARY_TYPES = ['INTERNAL', 'NIP', 'NEFT'] as const;
export type BeneficiaryType = (typeof BENEFICIARY_TYPES)[number];

// ----------------------------------------------------------------- real time

/**
 * Events pushed over SSE. Every event carries a monotonic `sequence` so a client
 * that reconnects with `Last-Event-ID` receives exactly what it missed.
 */
export const REALTIME_EVENTS = [
  'balance.updated',
  'transaction.posted',
  'transfer.state_changed',
  'notification.created',
  'fx.rate_updated',
  'risk.review_required',
  'loan.schedule_updated',
  'stream.ready',
] as const;
export type RealtimeEventType = (typeof REALTIME_EVENTS)[number];

export const NOTIFICATION_TYPES = [
  'TRANSFER_SENT',
  'TRANSFER_RECEIVED',
  'TRANSFER_FAILED',
  'DEPOSIT',
  'WITHDRAWAL',
  'LOW_BALANCE',
  'LIMIT_WARNING',
  'SECURITY_ALERT',
  'LOAN_PAYMENT_DUE',
  'STATEMENT_READY',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

// ------------------------------------------------------------- day counting

export const DAY_COUNT_CONVENTIONS = ['ACT/365', 'ACT/360', 'ACT/ACT', '30/360'] as const;
export type DayCountConventionName = (typeof DAY_COUNT_CONVENTIONS)[number];

export const INTEREST_COMPOUNDING_FREQUENCIES = [
  'DAILY',
  'MONTHLY',
  'QUARTERLY',
  'ANNUALLY',
] as const;
export type InterestCompoundingFrequency = (typeof INTEREST_COMPOUNDING_FREQUENCIES)[number];

export const PERIODS_PER_YEAR: Record<InterestCompoundingFrequency, number> = {
  DAILY: 365,
  MONTHLY: 12,
  QUARTERLY: 4,
  ANNUALLY: 1,
};
