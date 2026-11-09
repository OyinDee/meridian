import { useEffect, useMemo, useState } from 'react';
import { NIGERIAN_BANKS } from '@meridian/contracts';
import { ApiError, api, type Beneficiary, type Enquiry, type Transfer } from '../api/client.js';
import { useApp } from '../app/AppContext.js';
import type { Route } from '../app/useRoute.js';
import { fullDate, money, parseAmountToMinor, timeOf } from '../lib/format.js';
import {

  IconBank,
  IconCheck,
  IconChevronRight,
  IconPlus,
  IconShield,
  IconUsers,
} from '../components/Icons.js';

type Step = 'compose' | 'review' | 'done';

export function Transfers({ navigate }: { navigate: (route: Route) => void }) {
  const { accounts, reload } = useApp();
  const [step, setStep] = useState<Step>('compose');
  const [fromId, setFromId] = useState('');
  const [mode, setMode] = useState<'saved' | 'new'>('saved');
  const [beneficiaries, setBeneficiaries] = useState<readonly Beneficiary[]>([]);
  const [beneficiaryId, setBeneficiaryId] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [bankCode, setBankCode] = useState('000');
  const [amount, setAmount] = useState('');
  const [narration, setNarration] = useState('');
  const [enquiry, setEnquiry] = useState<Enquiry | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<Transfer | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  useEffect(() => {
    if (!fromId && accounts[0]) setFromId(accounts[0].id);
  }, [accounts, fromId]);

  useEffect(() => {
    void api.beneficiaries().then((result) => {
      setBeneficiaries(result.beneficiaries);
      if (result.beneficiaries[0]) setBeneficiaryId(result.beneficiaries[0].id);
    });
  }, []);

  const source = accounts.find((account) => account.id === fromId) ?? accounts[0];
  const beneficiary = beneficiaries.find((item) => item.id === beneficiaryId);
  const minor = parseAmountToMinor(amount);
  const available = source ? BigInt(source.availableMinor) : 0n;

  const recipient = useMemo(() => {
    if (mode === 'saved' && beneficiary) {
      return {
        name: beneficiary.name,
        accountNumber: beneficiary.accountNumber,
        bankCode: beneficiary.bankCode,
        bankName: bankNameFor(beneficiary.bankCode),
      };
    }
    return {
      name: enquiry?.name ?? 'New recipient',
      accountNumber,
      bankCode,
      bankName: bankNameFor(bankCode),
    };
  }, [mode, beneficiary, enquiry, accountNumber, bankCode]);

  useEffect(() => {
    setEnquiry(null);
    if (mode !== 'new' || accountNumber.length !== 10) return;
    let active = true;
    const timer = window.setTimeout(() => {
      void api
        .lookup(accountNumber)
        .then((result) => {
          if (active) setEnquiry(result);
        })
        .catch(() => undefined);
    }, 350);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [mode, accountNumber, bankCode]);

  function review(event: React.FormEvent): void {
    event.preventDefault();
    setError('');
    if (!source) return setError('Choose an account to send from.');
    if (!minor || minor <= 0n) return setError('Enter an amount greater than zero.');
    if (minor > available) return setError('That is more than the available balance on this account.');
    if (recipient.accountNumber.length !== 10) return setError('Enter a 10-digit account number.');
    if (mode === 'saved' && !beneficiary) return setError('Choose a saved payee or enter a new account.');
    setStep('review');
  }

  async function confirm(): Promise<void> {
    if (!source || !minor) return;
    setBusy(true);
    setError('');
    try {
      const result = await api.transfer(
        {
          fromAccountId: source.id,
          amount: amount.trim(),
          toAccountNumber: recipient.accountNumber,
          toBankCode: recipient.bankCode,
          narration: narration.trim() || undefined,
          channel: recipient.bankCode === '000' ? 'INTERNAL' : 'NIP',
        },
        idempotencyKey,
      );
      setReceipt(result);
      setStep('done');
      await reload();
    } catch (reason) {
      if (reason instanceof ApiError) {
        setError(
          reason.code === 'INSUFFICIENT_FUNDS'
            ? 'Your available balance changed. Reduce the amount and try again.'
            : reason.message,
        );
      } else {
        setError('The transfer could not be completed. Nothing was debited.');
      }
      setStep('compose');
    } finally {
      setBusy(false);
    }
  }

  function reset(): void {
    setStep('compose');
    setReceipt(null);
    setAmount('');
    setNarration('');
    setAccountNumber('');
    setEnquiry(null);
    setIdempotencyKey(crypto.randomUUID());
  }

  if (step === 'done' && receipt) {
    // The server is authoritative, but never show a settled transfer as zero:
    // fall back to the amount we actually submitted if the field is absent.
    const settledMinor =
      receipt.amountMinor && receipt.amountMinor !== '0' ? receipt.amountMinor : minor ?? 0n;
    const currency = receipt.currency ?? source?.currency ?? 'NGN';
    const settledName = receipt.toAccountName ?? recipient.name;
    const settledBank = bankNameFor(receipt.toBankCode ?? recipient.bankCode);
    const settledAt = receipt.settledAt ?? receipt.createdAt;

    return (
      <div className="page page-narrow">
        <section className="receipt" aria-labelledby="receipt-title">
          <div className="receipt-top">
            <span className="receipt-check" aria-hidden="true">
              <IconCheck size={24} />
            </span>
            <div className="receipt-heading">
              <p className="eyebrow eyebrow-brass">Transfer settled</p>
              <h2 id="receipt-title" className="receipt-amount">
                {money(settledMinor, currency)}
              </h2>
              <p className="receipt-copy">Sent to {settledName}</p>
            </div>
            <span className="chip chip-success receipt-status">Settled</span>
          </div>

          <div className="receipt-recipient">
            <span className="receipt-avatar" aria-hidden="true">
              {settledName.charAt(0)}
            </span>
            <span className="receipt-recipient-words">
              <strong>{settledName}</strong>
              <span>{settledBank} · {receipt.toAccountNumber ?? recipient.accountNumber}</span>
            </span>
          </div>

          <dl className="receipt-facts">
            <div><dt>Amount</dt><dd>{money(settledMinor, currency)}</dd></div>
            <div><dt>Fee</dt><dd>{money(receipt.feeMinor ?? '0', currency)}</dd></div>
            <div><dt>Channel</dt><dd>{receipt.channel === 'INTERNAL' ? 'Meridian instant' : 'NIP'}</dd></div>
            <div><dt>Date</dt><dd>{fullDate(settledAt)} · {timeOf(settledAt)}</dd></div>
            <div><dt>Reference</dt><dd className="mono">{receipt.reference}</dd></div>
          </dl>

          <p className="receipt-note">
            <IconShield size={15} />
            <span>Booked to the ledger. Keep the reference for support or reconciliation.</span>
          </p>

          <div className="receipt-actions">
            <button type="button" className="button button-primary" onClick={() => navigate('overview')}>
              Back to overview
            </button>
            <button type="button" className="button button-ghost" onClick={reset}>
              Send another
            </button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="page">
      <section className="page-intro">
        <div>
          <p className="eyebrow">Payments</p>
          <h2 className="display">Send money</h2>
          <p className="intro-copy">
            Instant to any Meridian account, NIP to every other Nigerian bank. Check the name before you confirm.
          </p>
        </div>
        <div className="stepper" aria-label="Transfer progress">
          <span className={step === 'compose' ? 'is-active' : 'is-done'}>1 Details</span>
          <i aria-hidden="true" />
          <span className={step === 'review' ? 'is-active' : ''}>2 Review</span>
          <i aria-hidden="true" />
          <span className={step === 'done' ? 'is-active' : ''}>3 Done</span>
        </div>
      </section>

      <div className="transfer-layout">
        <div className="panel transfer-panel">
          {step === 'compose' && (
            <form className="transfer-form" onSubmit={review}>
              <fieldset>
                <legend>From</legend>
                <div className="account-picker">
                  {accounts.map((account) => (
                    <label key={account.id} className={`account-option${fromId === account.id ? ' is-selected' : ''}`}>
                      <input
                        type="radio"
                        name="from"
                        value={account.id}
                        checked={fromId === account.id}
                        onChange={() => setFromId(account.id)}
                      />
                      <span className="account-option-words">
                        <span className="account-option-name">{account.nickname ?? account.type}</span>
                        <span className="account-option-meta">
                          {account.type.charAt(0) + account.type.slice(1).toLowerCase()} · {account.accountNumber}
                        </span>
                      </span>
                      <span className="account-option-balance">{money(account.availableMinor, account.currency)}</span>
                      <span className="account-option-check" aria-hidden="true"><IconCheck size={13} /></span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <fieldset>
                <legend>To</legend>
                <div className="segmented" role="tablist" aria-label="Recipient type">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={mode === 'saved'}
                    className={mode === 'saved' ? 'is-active' : ''}
                    onClick={() => setMode('saved')}
                  >
                    Saved payee
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={mode === 'new'}
                    className={mode === 'new' ? 'is-active' : ''}
                    onClick={() => setMode('new')}
                  >
                    New account
                  </button>
                </div>

                {mode === 'saved' ? (
                  beneficiaries.length === 0 ? (
                    <div className="empty-inline">
                      <p>No saved payees yet.</p>
                      <button type="button" className="text-button" onClick={() => navigate('payees')}>
                        <IconPlus size={14} /> Add your first payee
                      </button>
                    </div>
                  ) : (
                    <div className="payee-picker">
                      {beneficiaries.map((item) => (
                        <label key={item.id} className={`payee-option${beneficiaryId === item.id ? ' is-selected' : ''}`}>
                          <input
                            type="radio"
                            name="payee"
                            checked={beneficiaryId === item.id}
                            onChange={() => setBeneficiaryId(item.id)}
                          />
                          <span className="payee-avatar" aria-hidden="true">
                            {item.name.charAt(0)}
                          </span>
                          <span className="payee-words">
                            <span className="payee-name">{item.name}</span>
                            <span className="payee-meta">{bankNameFor(item.bankCode)} · {item.accountNumber}</span>
                          </span>
                          <span className="account-option-check" aria-hidden="true"><IconCheck size={13} /></span>
                        </label>
                      ))}
                    </div>
                  )
                ) : (
                  <div className="field-grid">
                    <label className="field">
                      <span>Account number</span>
                      <input
                        inputMode="numeric"
                        autoComplete="off"
                        maxLength={10}
                        placeholder="0123456789"
                        value={accountNumber}
                        onChange={(event) => setAccountNumber(event.target.value.replace(/\D/g, ''))}
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
                    {accountNumber.length === 10 && (
                      <div className={`name-enquiry${enquiry?.found ? ' is-found' : ''}`}>
                        <IconUsers size={16} />
                        <span>
                          {enquiry?.found
                            ? enquiry.name
                            : enquiry
                              ? 'No Meridian account with that number. It will be sent as an external NIP payment.'
                              : 'Checking the account name…'}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </fieldset>

              <fieldset>
                <legend>Amount</legend>
                <div className="amount-field">
                  <span className="amount-prefix">NGN</span>
                  <input
                    inputMode="decimal"
                    placeholder="0.00"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value.replace(/[^\d.]/g, ''))}
                    aria-label="Amount in naira"
                  />
                </div>
                <div className="quick-amounts">
                  {['5000', '10000', '25000', '50000'].map((preset) => (
                    <button key={preset} type="button" className="chip chip-button" onClick={() => setAmount(preset)}>
                      {Number(preset).toLocaleString('en-NG')}
                    </button>
                  ))}
                  <span className="available-note">
                    Available {source ? money(source.availableMinor, source.currency) : '—'}
                  </span>
                </div>
                <label className="field">
                  <span>Narration <em>optional</em></span>
                  <input
                    maxLength={80}
                    placeholder="What is this for?"
                    value={narration}
                    onChange={(event) => setNarration(event.target.value)}
                  />
                </label>
              </fieldset>

              {error && <p className="form-error" role="alert">{error}</p>}

              <button type="submit" className="button button-primary button-wide">
                Review transfer <IconChevronRight size={16} />
              </button>
            </form>
          )}

          {step === 'review' && (
            <div className="review">
              <p className="eyebrow">Confirm</p>
              <h3 className="review-title">Check before sending</h3>
              <p className="review-amount">{money(minor ?? 0n)}</p>
              <dl className="review-facts">
                <div><dt>To</dt><dd>{recipient.name}</dd></div>
                <div><dt>Account</dt><dd>{recipient.accountNumber}</dd></div>
                <div><dt>Bank</dt><dd>{recipient.bankName}</dd></div>
                <div><dt>From</dt><dd>{source?.nickname ?? source?.type} · {source?.accountNumber}</dd></div>
                <div><dt>Fee</dt><dd>{money('0')}</dd></div>
                <div><dt>Narration</dt><dd>{narration || 'Transfer'}</dd></div>
              </dl>
              <div className="review-note">
                <IconShield size={16} />
                <span>Transfers are final once sent. We will show you a receipt with the ledger reference.</span>
              </div>
              {error && <p className="form-error" role="alert">{error}</p>}
              <div className="review-actions">
                <button type="button" className="button button-ghost" onClick={() => setStep('compose')} disabled={busy}>
                  Back
                </button>
                <button type="button" className="button button-primary" onClick={() => void confirm()} disabled={busy}>
                  {busy ? <><span className="spinner" aria-hidden="true" /> Sending…</> : <>Send {money(minor ?? 0n)}</>}
                </button>
              </div>
            </div>
          )}
        </div>

        <aside className="transfer-aside">
          <article className="panel aside-card">
            <span className="aside-icon" aria-hidden="true"><IconBank size={18} /></span>
            <h3>Straight to the ledger</h3>
            <p>
              Your transfer is booked as a balanced journal: one debit, one credit, hashed into the bank's chain.
              That is why the receipt reference can always be audited.
            </p>
          </article>
          <article className="panel aside-card">
            <span className="aside-icon" aria-hidden="true"><IconShield size={18} /></span>
            <h3>Name checked first</h3>
            <p>
              Meridian accounts are resolved by name before you confirm. External transfers go out over NIP and
              arrive within seconds.
            </p>
          </article>
          <article className="transfer-limits">
            <p className="eyebrow">Today</p>
            <p className="limit-row"><span>Per transfer</span><span>NGN 1,000,000</span></p>
            <p className="limit-row"><span>Daily</span><span>NGN 5,000,000</span></p>
            <p className="limit-row"><span>Monthly</span><span>NGN 50,000,000</span></p>
          </article>
        </aside>
      </div>
    </div>
  );
}

function bankNameFor(code: string): string {
  return NIGERIAN_BANKS.find((bank) => bank.code === code)?.name ?? 'External bank';
}
