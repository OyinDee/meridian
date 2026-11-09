/**
 * Domain error catalogue.
 *
 * Every failure the bank can produce has a stable machine-readable `code` that the
 * API returns to clients, the frontend switches on, and the audit log records.
 * HTTP statuses are a transport concern and live here, not in business logic.
 */
export class DomainError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly httpStatus: number = 422,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = new.target.name;
    Error.captureStackTrace?.(this, new.target);
  }
}

// ------------------------------------------------------------------ transport

export class ValidationFailedError extends DomainError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('VALIDATION_FAILED', message, 400, details);
  }
}

export class UnauthenticatedError extends DomainError {
  constructor(code = 'AUTH_TOKEN_INVALID', message = 'Authentication is required.') {
    super(code, message, 401);
  }
}

export class ForbiddenError extends DomainError {
  constructor(code = 'FORBIDDEN', message = 'You do not have access to this resource.') {
    super(code, message, 403);
  }
}

export class NotFoundError extends DomainError {
  constructor(code: string, message: string) {
    super(code, message, 404);
  }
}

export class ConflictError extends DomainError {
  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(code, message, 409, details);
  }
}

// ------------------------------------------------------------------- identity

export class InvalidCredentialsError extends DomainError {
  constructor() {
    // Deliberately identical for unknown email and wrong password.
    super('AUTH_INVALID_CREDENTIALS', 'Email or password is incorrect.', 401);
  }
}

export class AccountLockedError extends DomainError {
  constructor(retryAfterSeconds: number) {
    super(
      'AUTH_ACCOUNT_LOCKED',
      'Too many failed attempts. Try again later.',
      423,
      { retryAfterSeconds },
    );
  }
}

export class MfaRequiredError extends DomainError {
  constructor() {
    super('AUTH_MFA_REQUIRED', 'Multi-factor authentication is required.', 401);
  }
}

export class MfaInvalidError extends DomainError {
  constructor(attemptsRemaining?: number) {
    super('AUTH_MFA_INVALID', 'That code is not valid.', 401, { attemptsRemaining });
  }
}

export class RefreshTokenReuseError extends DomainError {
  constructor() {
    super(
      'AUTH_REFRESH_REUSE_DETECTED',
      'This session was revoked because a used refresh token was replayed. Sign in again.',
      401,
    );
  }
}

export class StepUpRequiredError extends DomainError {
  constructor(thresholdMinor: bigint) {
    super('AUTH_STEP_UP_REQUIRED', 'Confirm this transfer with a fresh MFA code.', 403, {
      thresholdMinor: thresholdMinor.toString(),
    });
  }
}

// -------------------------------------------------------------------- ledger

export class AccountNotFoundError extends DomainError {
  constructor(idOrNumber: string) {
    super('ACCOUNT_NOT_FOUND', `Account ${idOrNumber} was not found.`, 404);
  }
}

export class AccountNotActiveError extends DomainError {
  constructor(public readonly status: string) {
    super('ACCOUNT_NOT_ACTIVE', `This account is ${status.toLowerCase()} and cannot move money.`, 423, {
      status,
    });
  }
}

export class CurrencyMismatchError extends DomainError {
  constructor(accountCurrency: string, requestedCurrency: string) {
    super(
      'CURRENCY_MISMATCH',
      `Account is denominated in ${accountCurrency} but the request used ${requestedCurrency}.`,
      422,
      { accountCurrency, requestedCurrency },
    );
  }
}

export class InsufficientFundsError extends DomainError {
  constructor(availableMinor: bigint, requestedMinor: bigint, currency: string) {
    super('INSUFFICIENT_FUNDS', 'Available balance does not cover this transfer.', 422, {
      currency,
      availableMinor: availableMinor.toString(),
      requestedMinor: requestedMinor.toString(),
      shortfallMinor: (requestedMinor - availableMinor).toString(),
    });
  }
}

export class JournalUnbalancedError extends DomainError {
  constructor(reference: string, imbalanceMinor: bigint) {
    super('JOURNAL_UNBALANCED', `Journal ${reference} is not balanced.`, 500, {
      reference,
      imbalanceMinor: imbalanceMinor.toString(),
    });
  }
}

export class ImmutableLedgerError extends DomainError {
  constructor(operation: string) {
    super('LEDGER_IMMUTABLE', `Ledger rows cannot be ${operation}d; post a reversal instead.`, 500);
  }
}

// ------------------------------------------------------------------ payments

export class TransferNotFoundError extends DomainError {
  constructor(reference: string) {
    super('TRANSFER_NOT_FOUND', `Transfer ${reference} was not found.`, 404);
  }
}

export class TransferStateError extends DomainError {
  constructor(from: string, to: string) {
    super('TRANSFER_INVALID_STATE', `A transfer in state ${from} cannot move to ${to}.`, 409, {
      from,
      to,
    });
  }
}

export class SelfTransferError extends DomainError {
  constructor() {
    super('TRANSFER_SELF_NOT_ALLOWED', 'Source and destination accounts are the same.', 422);
  }
}

export class BeneficiaryNotFoundError extends DomainError {
  constructor(id: string) {
    super('BENEFICIARY_NOT_FOUND', `Beneficiary ${id} was not found.`, 404);
  }
}

export class IdempotencyConflictError extends DomainError {
  constructor(key: string) {
    super(
      'IDEMPOTENCY_KEY_REUSED',
      'This Idempotency-Key was already used with a different request body.',
      409,
      { key },
    );
  }
}

export class RequestInFlightError extends DomainError {
  constructor(key: string) {
    super(
      'IDEMPOTENCY_IN_PROGRESS',
      'An identical request is still being processed.',
      409,
      { key },
    );
  }
}

// --------------------------------------------------------------------- limits

export class LimitExceededError extends DomainError {
  constructor(
    window: 'PER_TRANSACTION' | 'DAILY' | 'MONTHLY',
    limitMinor: bigint,
    attemptedMinor: bigint,
    currency: string,
  ) {
    super('LIMIT_EXCEEDED', `This transfer exceeds your ${window.replace('_', ' ').toLowerCase()} limit.`, 422, {
      window,
      currency,
      limitMinor: limitMinor.toString(),
      attemptedMinor: attemptedMinor.toString(),
    });
  }
}

export class RiskBlockedError extends DomainError {
  constructor(reasons: readonly string[], riskScore: number) {
    super('RISK_BLOCKED', 'This transfer was blocked by the risk engine.', 403, {
      reasons: [...reasons],
      riskScore,
    });
  }
}

// ------------------------------------------------------------------------ fx

export class FxRateUnavailableError extends DomainError {
  constructor(base: string, quote: string) {
    super('FX_RATE_UNAVAILABLE', `No ${base}/${quote} rate is available right now.`, 503, {
      base,
      quote,
    });
  }
}

export class FxQuoteExpiredError extends DomainError {
  constructor(quoteId: string) {
    super('FX_QUOTE_EXPIRED', 'That FX quote has expired. Request a new one.', 410, { quoteId });
  }
}

// --------------------------------------------------------------------- loans

export class LoanIneligibleError extends DomainError {
  constructor(reasons: readonly string[]) {
    super('LOAN_INELIGIBLE', 'This account is not eligible for that loan.', 422, {
      reasons: [...reasons],
    });
  }
}

export class LoanStateError extends DomainError {
  constructor(message: string) {
    super('LOAN_INVALID_STATE', message, 409);
  }
}

// --------------------------------------------------------------------- cards

export class CardNotActiveError extends DomainError {
  constructor(status: string) {
    super('CARD_NOT_ACTIVE', `Card is ${status.toLowerCase()}.`, 409, { status });
  }
}

export class CardLimitExceededError extends DomainError {
  constructor(limitMinor: bigint, currency: string) {
    super('CARD_LIMIT_EXCEEDED', 'This authorisation exceeds the card limit.', 422, {
      limitMinor: limitMinor.toString(),
      currency,
    });
  }
}

export function isDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError;
}
