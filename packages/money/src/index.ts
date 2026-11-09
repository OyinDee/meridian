/**
 * @meridian/money - exact money and finance math.
 *
 * Everything here is integer or rational arithmetic over bigint. There is no float
 * anywhere on the money path: amounts are counts of minor units, rates are exact
 * ratios, and rounding happens once, explicitly, at the currency's minor unit.
 */
export * from './allocation.js';
export * from './currencies.js';
export * from './errors.js';
export * from './finance.js';
export * from './money.js';
export * from './ratio.js';
export * from './rounding.js';
