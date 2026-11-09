import { useCallback, useEffect, useState } from 'react';
import { api, type Transaction } from '../api/client.js';

/** Loads the newest page once; pages that need more use their own paging. */
export function useRecentTransactions(limit: number): {
  items: readonly Transaction[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
} {
  const [items, setItems] = useState<readonly Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void api
      .transactions({ limit })
      .then((page) => {
        if (active) setItems(page.items);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Could not load activity.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [limit, version]);

  const refresh = useCallback(() => setVersion((value) => value + 1), []);
  return { items, loading, error, refresh };
}
