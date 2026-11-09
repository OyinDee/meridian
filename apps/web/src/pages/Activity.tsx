import { useEffect, useMemo, useState } from 'react';
import { api, type Transaction } from '../api/client.js';
import { useApp } from '../app/AppContext.js';
import { money } from '../lib/format.js';
import { IconSearch } from '../components/Icons.js';
import { TransactionList } from '../components/TransactionList.js';

export function Activity() {
  const { accounts } = useApp();
  const initialQuery = useMemo(() => {
    const hash = window.location.hash;
    const queryIndex = hash.indexOf('?');
    return queryIndex === -1 ? '' : new URLSearchParams(hash.slice(queryIndex + 1)).get('q') ?? '';
  }, []);

  const [items, setItems] = useState<readonly Transaction[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [accountId, setAccountId] = useState('');
  const [direction, setDirection] = useState<'' | 'IN' | 'OUT'>('');
  const [search, setSearch] = useState(initialQuery);
  const [appliedSearch, setAppliedSearch] = useState(initialQuery);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    void api
      .transactions({
        limit: 25,
        accountId: accountId || undefined,
        direction: direction || undefined,
        search: appliedSearch || undefined,
      })
      .then((page) => {
        if (!active) return;
        setItems(page.items);
        setCursor(page.nextCursor);
        setHasMore(page.hasMore);
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
  }, [accountId, direction, appliedSearch]);

  async function loadMore(): Promise<void> {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const page = await api.transactions({
        limit: 25,
        cursor,
        accountId: accountId || undefined,
        direction: direction || undefined,
        search: appliedSearch || undefined,
      });
      setItems((current) => [...current, ...page.items]);
      setCursor(page.nextCursor);
      setHasMore(page.hasMore);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load more.');
    } finally {
      setLoadingMore(false);
    }
  }

  const totalIn = items.filter((i) => i.direction === 'IN').reduce((sum, i) => sum + BigInt(i.amountMinor), 0n);
  const totalOut = items.filter((i) => i.direction === 'OUT').reduce((sum, i) => sum + BigInt(i.amountMinor), 0n);

  return (
    <div className="page">
      <section className="page-intro">
        <div>
          <p className="eyebrow">Statement</p>
          <h2 className="display">Activity</h2>
          <p className="intro-copy">
            Every line is a ledger entry with a running balance. Filter by account, direction, or search a reference.
          </p>
        </div>
        <div className="activity-totals">
          <div><span>In</span><strong className="is-in">{money(totalIn)}</strong></div>
          <div><span>Out</span><strong className="is-out">{money(totalOut)}</strong></div>
        </div>
      </section>

      <section className="panel">
        <div className="filters">
          <label className="filter-field">
            <span className="sr-only">Account</span>
            <select value={accountId} onChange={(event) => setAccountId(event.target.value)}>
              <option value="">All accounts</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.nickname ?? account.type} · {account.accountNumber.slice(-4)}
                </option>
              ))}
            </select>
          </label>

          <div className="segmented segmented-small" role="group" aria-label="Direction">
            {(['', 'IN', 'OUT'] as const).map((value) => (
              <button
                key={value || 'all'}
                type="button"
                className={direction === value ? 'is-active' : ''}
                onClick={() => setDirection(value)}
              >
                {value === '' ? 'All' : value === 'IN' ? 'Money in' : 'Money out'}
              </button>
            ))}
          </div>

          <form
            className="filter-search"
            onSubmit={(event) => {
              event.preventDefault();
              setAppliedSearch(search.trim());
            }}
          >
            <IconSearch size={16} />
            <input
              type="search"
              placeholder="Search narration or reference"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label="Search transactions"
            />
          </form>
        </div>

        {error && <p className="form-error" role="alert">{error}</p>}

        {loading ? (
          <div className="skeleton-stack">
            <span className="skeleton skeleton-row" />
            <span className="skeleton skeleton-row" />
            <span className="skeleton skeleton-row" />
            <span className="skeleton skeleton-row" />
          </div>
        ) : (
          <>
            <TransactionList
              items={items}
              showRunning
              empty={appliedSearch ? `No entries match “${appliedSearch}”.` : 'No entries match these filters.'}
            />
            {hasMore && (
              <div className="load-more">
                <button type="button" className="button button-ghost" onClick={() => void loadMore()} disabled={loadingMore}>
                  {loadingMore ? 'Loading…' : 'Load older entries'}
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
