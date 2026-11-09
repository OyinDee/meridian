import type { LoginRequest, TransferRequest } from '@meridian/contracts';

const API_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:4100/api').replace(/\/$/, '');
const TOKEN_KEY = 'meridian.access';

export interface SignedInUser {
  readonly id: string;
  readonly email: string;
  readonly phone: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly role: string;
  readonly kycStatus: string;
  readonly createdAt: string;
}

export interface Account {
  readonly id: string;
  readonly accountNumber: string;
  readonly type: string;
  readonly nickname: string | null;
  readonly currency: string;
  readonly status: string;
  readonly balanceMinor: string;
  readonly availableMinor: string;
  readonly holdsMinor: string;
}

export interface Summary {
  readonly totalMinor: string;
  readonly currency: string;
  readonly monthInMinor: string;
  readonly monthOutMinor: string;
  readonly spendByCategory: readonly { category: string; amountMinor: string }[];
  readonly accountCount: number;
}

export interface Transaction {
  readonly id: string;
  readonly journalId: string;
  readonly reference: string;
  readonly kind: string;
  readonly direction: 'IN' | 'OUT';
  readonly amountMinor: string;
  readonly balanceAfterMinor: string;
  readonly currency: string;
  readonly narration: string;
  readonly counterparty: string | null;
  readonly valueDate: string;
  readonly bookedAt: string;
}

export interface HistoryPage {
  readonly items: readonly Transaction[];
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
}

export interface Beneficiary {
  readonly id: string;
  readonly name: string;
  readonly accountNumber: string;
  readonly bankCode: string;
  readonly nickname: string | null;
  readonly isFavorite: boolean;
  readonly lastUsedAt: string | null;
}

export interface Transfer {
  readonly id: string;
  readonly reference: string;
  readonly status: string;
  readonly channel: string;
  readonly amountMinor: string;
  readonly feeMinor: string;
  readonly currency: string;
  readonly narration: string;
  readonly toAccountName: string | null;
  readonly toAccountNumber: string | null;
  readonly toBankCode: string | null;
  readonly fromAccountId: string;
  readonly createdAt: string;
  readonly settledAt: string | null;
}

export interface AppNotification {
  readonly id: string;
  readonly type: string;
  readonly title: string;
  readonly body: string;
  readonly read: boolean;
  readonly createdAt: string;
}

export interface Enquiry {
  readonly found: boolean;
  readonly name: string | null;
  readonly bank: string;
}

export interface Session {
  readonly accessToken: string;
  readonly user: SignedInUser;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

let accessToken: string | null = sessionStorage.getItem(TOKEN_KEY);

export function setAccessToken(token: string | null): void {
  accessToken = token;
  if (token) sessionStorage.setItem(TOKEN_KEY, token);
  else sessionStorage.removeItem(TOKEN_KEY);
}

export function hasAccessToken(): boolean {
  return accessToken !== null;
}

interface ErrorEnvelope {
  readonly error?: {
    readonly code?: string;
    readonly message?: string;
    readonly details?: Record<string, unknown>;
  };
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  retry = true,
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  if (accessToken) headers.set('authorization', `Bearer ${accessToken}`);

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { ...init, headers, credentials: 'include' });
  } catch {
    throw new ApiError('Cannot reach Meridian right now. Check your connection.', 0, 'NETWORK_ERROR');
  }

  if (response.status === 401 && retry && path !== '/auth/refresh' && path !== '/auth/login') {
    const refreshed = await silentRefresh();
    if (refreshed) return request<T>(path, init, false);
  }

  if (!response.ok) throw await toApiError(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

async function toApiError(response: Response): Promise<ApiError> {
  let body: ErrorEnvelope | undefined;
  try {
    body = (await response.json()) as ErrorEnvelope;
  } catch {
    // Non-JSON error body; fall through to the status-based message.
  }
  return new ApiError(
    body?.error?.message ?? `The server returned an error (${response.status}).`,
    response.status,
    body?.error?.code,
    body?.error?.details,
  );
}

export async function login(credentials: LoginRequest): Promise<Session> {
  const result = await request<{ accessToken: string; expiresIn: number }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(credentials),
  });
  setAccessToken(result.accessToken);
  const user = await request<SignedInUser>('/auth/me');
  return { accessToken: result.accessToken, user };
}

async function silentRefresh(): Promise<boolean> {
  try {
    const result = await request<{ accessToken: string }>('/auth/refresh', {
      method: 'POST',
      body: '{}',
    }, false);
    setAccessToken(result.accessToken);
    return true;
  } catch {
    setAccessToken(null);
    return false;
  }
}

/** Restore a session from the HttpOnly refresh cookie, if one exists. */
export async function restoreSession(): Promise<Session | null> {
  if (!accessToken) {
    const refreshed = await silentRefresh();
    if (!refreshed) return null;
  }
  try {
    const user = await request<SignedInUser>('/auth/me');
    return { accessToken: accessToken ?? '', user };
  } catch {
    setAccessToken(null);
    return null;
  }
}

export async function logout(): Promise<void> {
  try {
    await request('/auth/logout', { method: 'POST' });
  } finally {
    setAccessToken(null);
  }
}

export const api = {
  me: () => request<SignedInUser & { accounts: unknown[] }>('/auth/me'),
  accounts: () => request<{ accounts: Account[] }>('/accounts'),
  summary: () => request<Summary>('/accounts/summary'),
  transactions: (params: {
    accountId?: string;
    limit?: number;
    cursor?: string;
    direction?: 'IN' | 'OUT';
    search?: string;
  } = {}) => {
    const query = new URLSearchParams();
    if (params.accountId) query.set('accountId', params.accountId);
    if (params.limit) query.set('limit', String(params.limit));
    if (params.cursor) query.set('cursor', params.cursor);
    if (params.direction) query.set('direction', params.direction);
    if (params.search) query.set('search', params.search);
    return request<HistoryPage>(`/accounts/transactions?${query.toString()}`);
  },
  lookup: (accountNumber: string) => request<Enquiry>(`/accounts/lookup/${accountNumber}`),
  transfer: (input: TransferRequest, idempotencyKey: string) =>
    request<Transfer>('/transfers', {
      method: 'POST',
      headers: { 'idempotency-key': idempotencyKey },
      body: JSON.stringify(input),
    }),
  transfers: () => request<{ transfers: Transfer[] }>('/transfers'),
  beneficiaries: () => request<{ beneficiaries: Beneficiary[] }>('/beneficiaries'),
  createBeneficiary: (input: {
    name: string;
    accountNumber: string;
    bankCode: string;
    nickname?: string;
  }) => request<{ id: string }>('/beneficiaries', { method: 'POST', body: JSON.stringify(input) }),
  deleteBeneficiary: (id: string) => request<{ deleted: boolean }>(`/beneficiaries/${id}`, { method: 'DELETE' }),
  notifications: () => request<{ unread: number; notifications: AppNotification[] }>('/notifications'),
  readAllNotifications: () => request<{ read: boolean }>('/notifications/read-all', { method: 'POST' }),
};
