/** Exact money formatting: minor units stay strings until the final render. */
export function money(minor: string | bigint, currency = 'NGN'): string {
  const value = typeof minor === 'bigint' ? minor : BigInt(minor || '0');
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(Number(value) / 100);
}

/** `NGN 1.35m` style, for dense headers where the exact kobo is noise. */
export function compactMoney(minor: string | bigint, currency = 'NGN'): string {
  const value = Number(typeof minor === 'bigint' ? minor : BigInt(minor || '0')) / 100;
  const formatted = new Intl.NumberFormat('en-NG', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
  return `${currency} ${formatted}`;
}

export function exactAmount(minor: string | bigint): string {
  const value = typeof minor === 'bigint' ? minor : BigInt(minor || '0');
  return (Number(value) / 100).toLocaleString('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function minorToInput(minor: string): string {
  const value = BigInt(minor || '0');
  const whole = value / 100n;
  const fraction = value % 100n;
  return fraction === 0n ? whole.toString() : `${whole}.${fraction.toString().padStart(2, '0')}`;
}

export function parseAmountToMinor(value: string): bigint | null {
  const match = /^(\d{1,12})(?:\.(\d{1,2}))?$/.exec(value.trim().replace(/,/g, ''));
  if (!match) return null;
  return BigInt(match[1]!) * 100n + BigInt((match[2] ?? '').padEnd(2, '0'));
}

export function shortDate(iso: string): string {
  return new Intl.DateTimeFormat('en-NG', { day: 'numeric', month: 'short' }).format(new Date(iso));
}

export function fullDate(iso: string): string {
  return new Intl.DateTimeFormat('en-NG', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(iso));
}

export function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

export function dayLabel(key: string): string {
  const date = new Date(`${key}T12:00:00Z`);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const same = (a: Date, b: Date) => a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);
  if (same(date, today)) return 'Today';
  if (same(date, yesterday)) return 'Yesterday';
  return new Intl.DateTimeFormat('en-NG', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(date);
}

export function timeOf(iso: string): string {
  return new Intl.DateTimeFormat('en-NG', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

export function initials(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

export function accountLabel(type: string): string {
  return type.charAt(0) + type.slice(1).toLowerCase();
}

export function maskAccount(accountNumber: string): string {
  return `•••• ${accountNumber.slice(-4)}`;
}
