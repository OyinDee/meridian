import { UnknownCurrencyError } from './errors.js';

/**
 * ISO 4217 currency metadata. `scale` is the number of fraction digits in the
 * currency's minor unit, which is what every stored amount is denominated in.
 */
export interface CurrencySpec {
  readonly code: string;
  readonly numeric: string;
  readonly scale: number;
  readonly symbol: string;
  readonly name: string;
}

export const CURRENCY_SPECS = {
  // Home currency: every account opens in naira unless it is a deliberate FX account.
  NGN: { code: 'NGN', numeric: '566', scale: 2, symbol: '₦', name: 'Nigerian Naira' },
  USD: { code: 'USD', numeric: '840', scale: 2, symbol: '$', name: 'US Dollar' },
  EUR: { code: 'EUR', numeric: '978', scale: 2, symbol: '€', name: 'Euro' },
  GBP: { code: 'GBP', numeric: '826', scale: 2, symbol: '£', name: 'Pound Sterling' },
  ZAR: { code: 'ZAR', numeric: '710', scale: 2, symbol: 'R', name: 'South African Rand' },
  KES: { code: 'KES', numeric: '404', scale: 2, symbol: 'KSh', name: 'Kenyan Shilling' },
  GHS: { code: 'GHS', numeric: '936', scale: 2, symbol: '₵', name: 'Ghanaian Cedi' },
  CHF: { code: 'CHF', numeric: '756', scale: 2, symbol: 'Fr', name: 'Swiss Franc' },
  CAD: { code: 'CAD', numeric: '124', scale: 2, symbol: 'C$', name: 'Canadian Dollar' },
  // Deliberately included to prove the money type is not hard-coded to 2 decimals.
  JPY: { code: 'JPY', numeric: '392', scale: 0, symbol: '¥', name: 'Japanese Yen' },
} as const satisfies Record<string, CurrencySpec>;

export type CurrencyCode = keyof typeof CURRENCY_SPECS;

/**
 * The supported currencies as a readonly tuple, so downstream `z.enum(...)` and
 * `switch` statements get exhaustiveness checking rather than a bare `string[]`.
 * The two asserts below make the compiler fail if this list and CURRENCY_SPECS drift.
 */
export const SUPPORTED_CURRENCIES = [
  'NGN',
  'USD',
  'EUR',
  'GBP',
  'ZAR',
  'KES',
  'GHS',
  'CHF',
  'CAD',
  'JPY',
] as const satisfies readonly CurrencyCode[];

type MissingCurrency = Exclude<CurrencyCode, (typeof SUPPORTED_CURRENCIES)[number]>;
type ExtraCurrency = Exclude<(typeof SUPPORTED_CURRENCIES)[number], CurrencyCode>;
const _noMissingCurrency: MissingCurrency extends never ? true : false = true;
const _noExtraCurrency: ExtraCurrency extends never ? true : false = true;
void _noMissingCurrency;
void _noExtraCurrency;

/** Naira: the currency the product, the seed data and the default accounts use. */
export const DEFAULT_CURRENCY: CurrencyCode = 'NGN';

/** Default rendering locale for naira amounts. */
export const DEFAULT_LOCALE = 'en-NG';

/** Country and timezone the banking day is cut off in (West Africa Time, UTC+1). */
export const DEFAULT_TIMEZONE = 'Africa/Lagos';

export function isSupportedCurrency(code: string): code is CurrencyCode {
  return Object.prototype.hasOwnProperty.call(CURRENCY_SPECS, code);
}

export function getCurrency(code: string): CurrencySpec {
  if (!isSupportedCurrency(code)) throw new UnknownCurrencyError(code);
  return CURRENCY_SPECS[code];
}

export function currencyScale(code: CurrencyCode): number {
  return CURRENCY_SPECS[code].scale;
}
