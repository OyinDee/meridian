import { useEffect, useState } from 'react';
import { api, type Transaction } from '../api/client.js';
import { useApp } from '../app/AppContext.js';
import type { Route } from '../app/useRoute.js';
import { money } from '../lib/format.js';
import {
  IconArrowUpRight,
  IconCheck,
  IconCopy,
  IconShield,
  IconWallet,
} from '../components/Icons.js';
import { TransactionList } from '../components/TransactionList.js';

export function Accounts({ navigate }: { navigate: (route: Route) => void }) {
  const { accounts, loading } = useApp();
  const [selected, setSelected] = useState<string | null>(null);
  const [items, setItems] = useState<readonly Transaction[]>([]);
  const [loadingTxns, setLoadingTxns] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (!selected && accounts[0]) setSelected(accounts[0].id);
  }, [accounts, selected]);

  useEffect(() => {
    if (!selected) return;
    let active = true;
    setLoadingTxns(true);
    void api
      .transactions({ accountId: selected, limit: 20 })
      .then((page) => {
        if (active) setItems(page.items);
      })
      .finally(() => {
        if (active) setLoadingTxns(false);
      });
    return () => {
      active = false;
    };
  }, [selected]);

  async function copy(accountNumber: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(accountNumber);
      setCopied(accountNumber);
      window.setTimeout(() => setCopied(null), 1800);
    } catch {
      setCopied(null);
    }
  }

  const selectedAccount = accounts.find((account) => account.id === selected) ?? accounts[0];

  return (
    <div className="page">
      <section className="page-intro">
        <div>
          <p className="eyebrow">Held with Meridian</p>
          <h2 className="display">Your accounts</h2>
          <p className="intro-copy">
            Every balance below is reconciled against the bank's ledger. NUBAN account numbers work for
            transfers from any Nigerian bank.
          </p>
        </div>
        <button type="button" className="button button-primary" onClick={() => navigate('transfer')}>
          <IconArrowUpRight size={17} /> Send money
        </button>
      </section>

      {loading ? (
        <div className="account-grid">
          <span className="skeleton account-skeleton" />
          <span className="skeleton account-skeleton" />
        </div>
      ) : (
        <div className="account-grid">
          {accounts.map((account) => (
            <article
              key={account.id}
              className={`account-card${selected === account.id ? ' is-selected' : ''}`}
            >
              <div className="account-card-top">
                <span className="account-icon" aria-hidden="true">
                  <IconWallet size={18} />
                </span>
                <span className={`chip${account.status === 'ACTIVE' ? ' chip-success' : ''}`}>
                  {account.status.charAt(0) + account.status.slice(1).toLowerCase()}
                </span>
              </div>
              <p className="account-card-type">{account.type.charAt(0) + account.type.slice(1).toLowerCase()} account</p>
              <h3 className="account-card-name">{account.nickname ?? account.type}</h3>
              <p className="account-card-balance">{money(account.balanceMinor, account.currency)}</p>
              <dl className="account-card-facts">
                <div>
                  <dt>Available</dt>
                  <dd>{money(account.availableMinor, account.currency)}</dd>
                </div>
                <div>
                  <dt>On hold</dt>
                  <dd>{money(account.holdsMinor, account.currency)}</dd>
                </div>
              </dl>
              <div className="account-card-foot">
                <button type="button" className="account-number-button" onClick={() => void copy(account.accountNumber)}>
                  <span>{account.accountNumber}</span>
                  {copied === account.accountNumber ? <IconCheck size={15} /> : <IconCopy size={15} />}
                  <span className="sr-only">Copy account number</span>
                </button>
                <button type="button" className="text-button" onClick={() => setSelected(account.id)}>
                  Statement
                </button>
              </div>
            </article>
          ))}

          <article className="account-card account-card-note">
            <span className="account-icon" aria-hidden="true">
              <IconShield size={18} />
            </span>
            <h3 className="account-card-name">Protected by design</h3>
            <p className="account-card-copy">
              Balances are derived from double-entry journals, not editable rows. Every posting is hash-chained,
              so an alteration would be detected.
            </p>
          </article>
        </div>
      )}

      <section className="panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow">Statement</p>
            <h3>{selectedAccount?.nickname ?? 'Account'} activity</h3>
          </div>
          {accounts.length > 1 && (
            <label className="select-inline">
              <span className="sr-only">Choose account</span>
              <select
                value={selectedAccount?.id ?? ''}
                onChange={(event) => setSelected(event.target.value)}
              >
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.nickname ?? account.type} · {account.accountNumber.slice(-4)}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {loadingTxns ? (
          <div className="skeleton-stack">
            <span className="skeleton skeleton-row" />
            <span className="skeleton skeleton-row" />
            <span className="skeleton skeleton-row" />
          </div>
        ) : (
          <TransactionList items={items} showRunning empty="No entries on this account yet." />
        )}
      </section>
    </div>
  );
}
