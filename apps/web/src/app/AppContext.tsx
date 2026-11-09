import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, type Account, type AppNotification, type SignedInUser, type Summary } from '../api/client.js';

interface AppState {
  readonly user: SignedInUser;
  readonly accounts: readonly Account[];
  readonly summary: Summary | null;
  readonly notifications: readonly AppNotification[];
  readonly unread: number;
  readonly loading: boolean;
  readonly error: string | null;
  reload(): Promise<void>;
  markNotificationsRead(): Promise<void>;
  signOut(): void;
}

const AppContext = createContext<AppState | null>(null);

export function AppProvider({
  user,
  onSignOut,
  children,
}: {
  user: SignedInUser;
  onSignOut: () => void;
  children: ReactNode;
}) {
  const [accounts, setAccounts] = useState<readonly Account[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [notifications, setNotifications] = useState<readonly AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [accountResult, summaryResult, notificationResult] = await Promise.all([
        api.accounts(),
        api.summary(),
        api.notifications(),
      ]);
      setAccounts(accountResult.accounts);
      setSummary(summaryResult);
      setNotifications(notificationResult.notifications);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load your accounts.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const markNotificationsRead = useCallback(async () => {
    setNotifications((current) => current.map((item) => ({ ...item, read: true })));
    await api.readAllNotifications().catch(() => undefined);
  }, []);

  const value = useMemo<AppState>(
    () => ({
      user,
      accounts,
      summary,
      notifications,
      unread: notifications.filter((item) => !item.read).length,
      loading,
      error,
      reload,
      markNotificationsRead,
      signOut: onSignOut,
    }),
    [user, accounts, summary, notifications, loading, error, reload, markNotificationsRead, onSignOut],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppState {
  const state = useContext(AppContext);
  if (!state) throw new Error('useApp must be used inside AppProvider');
  return state;
}
