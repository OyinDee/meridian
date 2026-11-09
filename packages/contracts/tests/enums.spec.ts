import { describe, expect, it } from 'vitest';
import {
  ACCOUNT_TYPES,
  CUSTOMER_ACCOUNT_TYPES,
  INTEREST_COMPOUNDING_FREQUENCIES,
  JOURNAL_KINDS,
  LEDGER_DIRECTIONS,
  NORMAL_BALANCES,
  PERIODS_PER_YEAR,
  PERMISSIONS,
  REALTIME_EVENTS,
  ROLES,
  ROLE_PERMISSIONS,
  TERMINAL_TRANSFER_STATUSES,
  TRANSFER_STATUSES,
} from '../src/index.js';

const isUnique = (values: readonly string[]): boolean => new Set(values).size === values.length;

describe('ledger vocabulary', () => {
  it('keeps every enum free of duplicates', () => {
    for (const values of [ACCOUNT_TYPES, JOURNAL_KINDS, TRANSFER_STATUSES, REALTIME_EVENTS, PERMISSIONS]) {
      expect(isUnique(values as readonly string[])).toBe(true);
    }
  });

  it('has exactly two ledger directions and two normal balances', () => {
    expect(LEDGER_DIRECTIONS).toEqual(['DEBIT', 'CREDIT']);
    expect(NORMAL_BALANCES).toEqual(['DEBIT', 'CREDIT']);
  });

  it('never exposes bank-internal account types to customers', () => {
    expect(CUSTOMER_ACCOUNT_TYPES).not.toContain('SUSPENSE');
    expect(CUSTOMER_ACCOUNT_TYPES).not.toContain('INTERNAL');
    for (const type of CUSTOMER_ACCOUNT_TYPES) {
      expect(ACCOUNT_TYPES).toContain(type);
    }
  });
});

describe('transfer lifecycle', () => {
  it('only treats statuses that need no further work as terminal', () => {
    for (const status of TERMINAL_TRANSFER_STATUSES) {
      expect(TRANSFER_STATUSES).toContain(status);
    }
    expect(TERMINAL_TRANSFER_STATUSES).not.toContain('PENDING');
    expect(TERMINAL_TRANSFER_STATUSES).not.toContain('PROCESSING');
    expect(TERMINAL_TRANSFER_STATUSES).not.toContain('RISK_REVIEW');
  });

  it('lets a settled transfer still be reversed or refunded', () => {
    expect(TERMINAL_TRANSFER_STATUSES).toEqual(
      expect.arrayContaining(['SETTLED', 'REVERSED', 'REFUNDED', 'FAILED', 'BLOCKED']),
    );
  });
});

describe('role permissions', () => {
  it('defines permissions for every role with valid permission names', () => {
    for (const role of ROLES) {
      const granted = ROLE_PERMISSIONS[role];
      expect(granted, role).toBeDefined();
      expect(granted.length, role).toBeGreaterThan(0);
      for (const permission of granted) {
        expect(PERMISSIONS, `${role} -> ${permission}`).toContain(permission);
      }
    }
  });

  it('gives a customer nothing beyond their own account and transfers', () => {
    expect([...ROLE_PERMISSIONS.CUSTOMER].sort()).toEqual(['account:read:own', 'transfer:create']);
  });

  it('makes ADMIN a superset of every other role', () => {
    for (const role of ROLES) {
      for (const permission of ROLE_PERMISSIONS[role]) {
        expect(ROLE_PERMISSIONS.ADMIN, `${role} needs ${permission}`).toContain(permission);
      }
    }
  });

  it('keeps read-only auditor access free of money movement', () => {
    expect(ROLE_PERMISSIONS.AUDITOR).not.toContain('transfer:create');
    expect(ROLE_PERMISSIONS.AUDITOR).not.toContain('risk:decide');
    expect(ROLE_PERMISSIONS.AUDITOR).toContain('ledger:read');
  });
});

describe('interest vocabulary', () => {
  it('defines periods per year for every compounding frequency', () => {
    for (const frequency of INTEREST_COMPOUNDING_FREQUENCIES) {
      expect(PERIODS_PER_YEAR[frequency], frequency).toBeGreaterThan(0);
    }
    expect(PERIODS_PER_YEAR.MONTHLY).toBe(12);
    expect(PERIODS_PER_YEAR.DAILY).toBe(365);
  });
});
