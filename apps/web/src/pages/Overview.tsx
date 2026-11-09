import { useMemo } from 'react';
import { useApp } from '../app/AppContext.js';
import type { Route } from '../app/useRoute.js';
import { money, shortDate } from '../lib/format.js';
import {
  IconArrowDownLeft,
  IconArrowUpRight,
  IconArrows,
  IconChevronRight,
  IconPlus,
  IconWallet,
} from '../components/Icons.js';
import { TransactionList } from '../components/TransactionList.js';
import { useRecentTransactions } from '../lib/useTransactions.js';

export function Overview({ navigate }: { navigate: (route: Route) => void }) {
  const { user, accounts, summary, loading } = useApp();
  const { items, loading: historyLoading } = useRecentTransactions(8);

  const primary = accounts[0];
  const monthIn = summary ? BigInt(summary.monthInMinor) : 0n;
  const monthOut = summary ? BigInt(summary.monthOutMinor) : 0n;
  const maxCategory = summary?.spendByCategory[0] ? BigInt(summary.spendByCategory[0].amountMinor) : 1n;

  const cashflow = useMemo(() => {
    const buckets = new Map<string, { in: bigint; out: bigint }>();
    for (const item of items) {
      const key = item.bookedAt.slice(0, 7);
      const bucket = buckets.get(key) ?? { in: 0n, out: 0n };
      if (item.direction === 'IN') bucket.in += BigInt(item.amountMinor);
      else bucket.out += BigInt(item.amountMinor);
      buckets.set(key, bucket);
    }
    return [...buckets.entries()].slice(-5);
  }, [items]);

  const maxFlow = Math.max(1, ...cashflow.map(([, bucket]) => Number(bucket.in + bucket.out)));

  return (
    <div className="page page-overview">
      <section className="greeting">
        <div>
          <p className="eyebrow">Good to see you</p>
          <h2 className="display">
            {greeting()}, {user.firstName}.
          </h2>
        </div>
        <div className="greeting-actions">
          <button type="button" className="button button-primary" onClick={() => navigate('transfer')}>
            <IconArrows size={17} /> Send money
          </button>
          <button type="button" className="button button-ghost" onClick={() => navigate('payees')}>
            <IconPlus size={17} /> Add payee
          </button>
        </div>
      </section>

      <section className="overview-grid">
        <article className="balance-card">
          <div className="balance-head">
            <p className="eyebrow eyebrow-brass">Total available</p>
            <span className="chip chip-quiet">{summary?.accountCount ?? accounts.length} accounts</span>
          </div>
          <p className="balance-figure">
            {loading ? <span className="skeleton skeleton-lg" /> : money(summary?.totalMinor ?? '0')}
          </p>
          <div className="balance-foot">
            <div>
              <span className="stat-label">Money in this month</span>
              <span className="stat-value is-in">
                <IconArrowDownLeft size={14} /> {money(monthIn)}
              </span>
            </div>
            <div>
              <span className="stat-label">Money out this month</span>
              <span className="stat-value is-out">
                <IconArrowUpRight size={14} /> {money(monthOut)}
              </span>
            </div>
          </div>
          <div className="balance-actions">
            <button type="button" className="button button-oncard" onClick={() => navigate('activity')}>
              View statement <IconChevronRight size={15} />
            </button>
          </div>
          <div className="balance-glow" aria-hidden="true" />
        </article>

        <article className="panel cashflow-card">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Cashflow</p>
              <h3>Recent months</h3>
            </div>
            <div className="legend">
              <span className="legend-item"><i className="legend-swatch swatch-in" /> In</span>
              <span className="legend-item"><i className="legend-swatch swatch-out" /> Out</span>
            </div>
          </div>

          {cashflow.length === 0 ? (
            <div className="empty-state empty-compact">
              <p className="empty-body">Your cashflow appears after your first transaction.</p>
            </div>
          ) : (
            <div className="bars" role="img" aria-label="Money in and out over recent months">
              {cashflow.map(([month, bucket]) => {
                const inHeight = Math.max(4, (Number(bucket.in) / maxFlow) * 100);
                const outHeight = Math.max(4, (Number(bucket.out) / maxFlow) * 100);
                const label = new Intl.DateTimeFormat('en-NG', { month: 'short' }).format(
                  new Date(`${month}-01T12:00:00Z`),
                );
                return (
                  <div className="bar-group" key={month}>
                    <div className="bar-stack">
                      <span className="bar bar-in" style={{ height: `${inHeight}%` }} title={`In ${money(bucket.in)}`} />
                      <span className="bar bar-out" style={{ height: `${outHeight}%` }} title={`Out ${money(bucket.out)}`} />
                    </div>
                    <span className="bar-label">{label}</span>
                  </div>
                );
              })}
            </div>
          )}
        </article>
      </section>

      <section className="overview-columns">
        <article className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Your accounts</p>
              <h3>Where your money sits</h3>
            </div>
            <button type="button" className="text-button" onClick={() => navigate('accounts')}>
              All accounts
            </button>
          </div>

          <ul className="account-list">
            {accounts.map((account) => (
              <li key={account.id}>
                <button type="button" className="account-row" onClick={() => navigate('accounts')}>
                  <span className="account-icon" aria-hidden="true">
                    <IconWallet size={18} />
                  </span>
                  <span className="account-words">
                    <span className="account-name">{account.nickname ?? account.type}</span>
                    <span className="account-number">
                      {account.type.charAt(0) + account.type.slice(1).toLowerCase()} · {account.accountNumber}
                    </span>
                  </span>
                  <span className="account-balance">{money(account.balanceMinor, account.currency)}</span>
                  <IconChevronRight size={16} />
                </button>
              </li>
            ))}
          </ul>
        </article>

        <article className="panel panel-spend">
          <div className="panel-head">
            <div>
              <p className="eyebrow">This month</p>
              <h3>Where it went</h3>
            </div>
            <span className="chip">{money(monthOut)}</span>
          </div>

          {summary && summary.spendByCategory.length > 0 ? (
            <ul className="spend-list">
              {summary.spendByCategory.map((category, index) => {
                const width = Number((BigInt(category.amountMinor) * 100n) / (maxCategory || 1n));
                return (
                  <li key={category.category}>
                    <div className="spend-head">
                      <span>{category.category}</span>
                      <span>{money(category.amountMinor)}</span>
                    </div>
                    <div className="spend-track">
                      <span
                        className={`spend-bar tone-${index % 4}`}
                        style={{ width: `${Math.max(3, width)}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="empty-state empty-compact">
              <p className="empty-body">No spending recorded this month yet.</p>
            </div>
          )}
        </article>
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow">Latest</p>
            <h3>Recent activity</h3>
          </div>
          <button type="button" className="text-button" onClick={() => navigate('activity')}>
            Full statement
          </button>
        </div>
        {historyLoading ? (
          <div className="skeleton-stack">
            <span className="skeleton skeleton-row" />
            <span className="skeleton skeleton-row" />
            <span className="skeleton skeleton-row" />
          </div>
        ) : (
          <TransactionList items={items} empty="Send money or receive a deposit to start your statement." />
        )}
      </section>

      {primary && summary && (
        <p className="footnote">
          Primary account {primary.accountNumber} · statement up to {shortDate(new Date().toISOString())}
        </p>
      )}
    </div>
  );
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}
