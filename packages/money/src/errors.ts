/**
 * Domain errors thrown by the money package.
 *
 * Every error carries a stable machine-readable `code` so the API layer can map it
 * onto an HTTP status and an error body without string matching.
 */
export type MoneyErrorCode =
  | 'MONEY_INVALID_AMOUNT'
  | 'MONEY_PRECISION'
  | 'MONEY_UNKNOWN_CURRENCY'
  | 'MONEY_CURRENCY_MISMATCH'
  | 'MONEY_DIVISION_BY_ZERO'
  | 'MONEY_INVALID_RATIO'
  | 'MONEY_INVALID_WEIGHTS';

export class MoneyError extends Error {
  readonly code: MoneyErrorCode;

  constructor(code: MoneyErrorCode, message: string) {
    super(message);
    this.name = new.target.name;
    this.code = code;
  }
}

/** The input could not be interpreted as a monetary amount. */
export class InvalidAmountError extends MoneyError {
  constructor(message: string) {
    super('MONEY_INVALID_AMOUNT', message);
  }
}

/** The amount has more fraction digits than the currency allows, and rounding was not permitted. */
export class PrecisionError extends MoneyError {
  constructor(amount: string, code: string, scale: number) {
    super(
      'MONEY_PRECISION',
      `Amount ${amount} has more than ${scale} fraction digits allowed by ${code}`,
    );
  }
}

export class UnknownCurrencyError extends MoneyError {
  constructor(code: string) {
    super('MONEY_UNKNOWN_CURRENCY', `Unsupported currency: ${code}`);
  }
}

/** Arithmetic between two different currencies. */
export class CurrencyMismatchError extends MoneyError {
  constructor(left: string, right: string) {
    super('MONEY_CURRENCY_MISMATCH', `Cannot combine ${left} with ${right}`);
  }
}

export class DivisionByZeroError extends MoneyError {
  constructor() {
    super('MONEY_DIVISION_BY_ZERO', 'Division by zero');
  }
}

export class InvalidRatioError extends MoneyError {
  constructor(message: string) {
    super('MONEY_INVALID_RATIO', message);
  }
}

export class InvalidWeightsError extends MoneyError {
  constructor(message: string) {
    super('MONEY_INVALID_WEIGHTS', message);
  }
}
