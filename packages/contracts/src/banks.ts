/**
 * Nigerian bank codes used by the NIP/NEFT payment flows.
 *
 * Sourced from the NIBSS institution list; the transfer wizard uses this to render a
 * bank picker, and the API validates that a beneficiary's bank code is real.
 */
export interface Bank {
  readonly code: string;
  readonly name: string;
  readonly shortName: string;
}

export const NIGERIAN_BANKS: readonly Bank[] = [
  { code: '044', name: 'Access Bank', shortName: 'Access' },
  { code: '063', name: 'Access Bank (Diamond)', shortName: 'Diamond' },
  { code: '035', name: 'Wema Bank (ALAT)', shortName: 'Wema' },
  { code: '50931', name: 'Bowen Microfinance Bank', shortName: 'Bowen' },
  { code: '023', name: 'Citibank Nigeria', shortName: 'Citibank' },
  { code: '050', name: 'Ecobank Nigeria', shortName: 'Ecobank' },
  { code: '084', name: 'Enterprise Bank', shortName: 'Enterprise' },
  { code: '070', name: 'Fidelity Bank', shortName: 'Fidelity' },
  { code: '011', name: 'First Bank of Nigeria', shortName: 'FirstBank' },
  { code: '214', name: 'First City Monument Bank', shortName: 'FCMB' },
  { code: '058', name: 'Guaranty Trust Bank', shortName: 'GTBank' },
  { code: '030', name: 'Heritage Bank', shortName: 'Heritage' },
  { code: '301', name: 'Jaiz Bank', shortName: 'Jaiz' },
  { code: '082', name: 'Keystone Bank', shortName: 'Keystone' },
  { code: '526', name: 'Parallex Bank', shortName: 'Parallex' },
  { code: '076', name: 'Polaris Bank', shortName: 'Polaris' },
  { code: '101', name: 'Providus Bank', shortName: 'Providus' },
  { code: '221', name: 'Stanbic IBTC Bank', shortName: 'Stanbic' },
  { code: '068', name: 'Standard Chartered Bank Nigeria', shortName: 'Standard Chartered' },
  { code: '232', name: 'Sterling Bank', shortName: 'Sterling' },
  { code: '100', name: 'Suntrust Bank', shortName: 'Suntrust' },
  { code: '032', name: 'Union Bank of Nigeria', shortName: 'Union' },
  { code: '033', name: 'United Bank for Africa', shortName: 'UBA' },
  { code: '215', name: 'Unity Bank', shortName: 'Unity' },
  { code: '057', name: 'Zenith Bank', shortName: 'Zenith' },
  // Meridian itself: the pseudo-code used for on-us (internal) transfers.
  { code: '000', name: 'Meridian Bank', shortName: 'Meridian' },
];

const BANK_BY_CODE = new Map<string, Bank>(NIGERIAN_BANKS.map((bank) => [bank.code, bank]));

export function findBank(code: string): Bank | undefined {
  return BANK_BY_CODE.get(code);
}

export function bankName(code: string): string {
  return BANK_BY_CODE.get(code)?.shortName ?? `Bank ${code}`;
}

/** Meridian's own institution code; transfers to it never leave the building. */
export const MERIDIAN_BANK_CODE = '000';
