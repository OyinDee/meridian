import type { Transaction } from '../api/client.js';
import { dayKey, dayLabel, money, timeOf } from '../lib/format.js';
import { IconArrowDownLeft, IconArrowUpRight } from './Icons.js';

export function TransactionList({
  items,
  empty = 'No transactions yet.',
  showRunning = false,
}: {
  items: readonly Transaction[];
  empty?: string;
  showRunning?: boolean;
}) {
  if (items.length === 0) {
    return (
      <div className="empty-state">
        <p className="empty-title">Nothing here yet</p>
        <p className="empty-body">{empty}</p>
      </div>
    );
  }

  const groups = new Map<string, Transaction[]>();
  for (const item of items) {
    const key = dayKey(item.valueDate);
    const bucket = groups.get(key) ?? [];
    bucket.push(item);
    groups.set(key, bucket);
  }

  return (
    <div className="txn-groups">
      {[...groups.entries()].map(([key, group]) => (
        <section key={key} className="txn-group" aria-label={dayLabel(key)}>
          <div className="txn-group-head">
            <h3>{dayLabel(key)}</h3>
            <span>{group.length} {group.length === 1 ? 'entry' : 'entries'}</span>
          </div>
          <ul className="txn-list">
            {group.map((item) => (
              <li key={item.id} className="txn">
                <span className={`txn-icon ${item.direction === 'IN' ? 'is-in' : 'is-out'}`} aria-hidden="true">
                  {item.direction === 'IN' ? <IconArrowDownLeft size={17} /> : <IconArrowUpRight size={17} />}
                </span>
                <div className="txn-main">
                  <p className="txn-title">{item.counterparty ?? item.narration}</p>
                  <p className="txn-meta">
                    {item.counterparty ? item.narration : labelFor(item.kind)}
                    <span className="txn-sep" aria-hidden="true">·</span>
                    {timeOf(item.bookedAt)}
                  </p>
                </div>
                {showRunning && (
                  <div className="txn-running">
                    <span className="txn-running-label">Balance</span>
                    <span>{money(item.balanceAfterMinor, item.currency)}</span>
                  </div>
                )}
                <span className={`txn-amount ${item.direction === 'IN' ? 'is-in' : 'is-out'}`}>
                  {item.direction === 'IN' ? '+' : '−'}
                  {money(item.amountMinor, item.currency)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function labelFor(kind: string): string {
  return kind
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
