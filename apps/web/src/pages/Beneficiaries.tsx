import { useEffect, useState } from 'react';
import { NIGERIAN_BANKS } from '@meridian/contracts';
import { api, type Beneficiary } from '../api/client.js';
import { IconArrows, IconPlus, IconTrash, IconUsers } from '../components/Icons.js';
import type { Route } from '../app/useRoute.js';

export function Beneficiaries({ navigate }: { navigate: (route: Route) => void }) {
  const [items, setItems] = useState<readonly Beneficiary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [bankCode, setBankCode] = useState('058');
  const [nickname, setNickname] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  async function load(): Promise<void> {
    setLoading(true);
    try {
      const result = await api.beneficiaries();
      setItems(result.beneficiaries);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setError('');
    if (name.trim().length < 2) return setError('Enter the payee name.');
    if (accountNumber.length !== 10) return setError('Enter a 10-digit account number.');
    setBusy(true);
    try {
      await api.createBeneficiary({
        name: name.trim(),
        accountNumber,
        bankCode,
        nickname: nickname.trim() || undefined,
      });
      setName('');
      setAccountNumber('');
      setNickname('');
      setShowForm(false);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save this payee.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string): Promise<void> {
    setRemoving(id);
    try {
      await api.deleteBeneficiary(id);
      setItems((current) => current.filter((item) => item.id !== id));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not remove this payee.');
    } finally {
      setRemoving(null);
    }
  }

  return (
    <div className="page">
      <section className="page-intro">
        <div>
          <p className="eyebrow">Address book</p>
          <h2 className="display">Payees</h2>
          <p className="intro-copy">
            Save the people and businesses you pay often. Meridian resolves on-us accounts by name before a transfer.
          </p>
        </div>
        <button type="button" className="button button-primary" onClick={() => setShowForm((value) => !value)}>
          <IconPlus size={17} /> {showForm ? 'Close form' : 'Add payee'}
        </button>
      </section>

      {showForm && (
        <section className="panel form-panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">New payee</p>
              <h3>Who are you paying?</h3>
            </div>
          </div>
          <form className="payee-form" onSubmit={(event) => void submit(event)}>
            <label className="field">
              <span>Payee name</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="As it appears on their account"
                maxLength={80}
              />
            </label>
            <label className="field">
              <span>Account number</span>
              <input
                value={accountNumber}
                onChange={(event) => setAccountNumber(event.target.value.replace(/\D/g, ''))}
                placeholder="0123456789"
                inputMode="numeric"
                maxLength={10}
              />
            </label>
            <label className="field">
              <span>Bank</span>
              <select value={bankCode} onChange={(event) => setBankCode(event.target.value)}>
                {NIGERIAN_BANKS.map((bank) => (
                  <option key={bank.code} value={bank.code}>{bank.name}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Nickname <em>optional</em></span>
              <input
                value={nickname}
                onChange={(event) => setNickname(event.target.value)}
                placeholder="e.g. Landlord"
                maxLength={40}
              />
            </label>
            {error && <p className="form-error" role="alert">{error}</p>}
            <div className="form-actions">
              <button type="button" className="button button-ghost" onClick={() => setShowForm(false)}>
                Cancel
              </button>
              <button type="submit" className="button button-primary" disabled={busy}>
                {busy ? 'Saving…' : 'Save payee'}
              </button>
            </div>
          </form>
        </section>
      )}

      {!showForm && error && <p className="form-error" role="alert">{error}</p>}

      {loading ? (
        <div className="payee-grid">
          <span className="skeleton payee-skeleton" />
          <span className="skeleton payee-skeleton" />
        </div>
      ) : items.length === 0 ? (
        <section className="panel">
          <div className="empty-state">
            <span className="empty-icon" aria-hidden="true"><IconUsers size={22} /></span>
            <p className="empty-title">No payees saved</p>
            <p className="empty-body">Add a payee once and their details appear at checkout every time.</p>
            <button type="button" className="button button-primary" onClick={() => setShowForm(true)}>
              <IconPlus size={16} /> Add your first payee
            </button>
          </div>
        </section>
      ) : (
        <div className="payee-grid">
          {items.map((item) => (
            <article key={item.id} className="payee-card">
              <span className="payee-avatar payee-avatar-lg" aria-hidden="true">{item.name.charAt(0)}</span>
              <div className="payee-card-words">
                <h3>{item.name}</h3>
                <p>{bankNameFor(item.bankCode)}</p>
                <p className="mono">{item.accountNumber}</p>
                {item.nickname && <span className="chip chip-quiet">{item.nickname}</span>}
              </div>
              <div className="payee-card-actions">
                <button type="button" className="button button-ghost button-small" onClick={() => navigate('transfer')}>
                  <IconArrows size={15} /> Send
                </button>
                <button
                  type="button"
                  className="icon-button icon-button-danger"
                  onClick={() => void remove(item.id)}
                  disabled={removing === item.id}
                  aria-label={`Remove ${item.name}`}
                >
                  <IconTrash size={16} />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function bankNameFor(code: string): string {
  return NIGERIAN_BANKS.find((bank) => bank.code === code)?.name ?? 'External bank';
}
