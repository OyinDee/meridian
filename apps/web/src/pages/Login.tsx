import { useState } from 'react';
import { login } from '../api/client.js';
import { loginSchema } from '@meridian/contracts';
import { IconArrowUpRight, IconShield } from '../components/Icons.js';

export function Login({ onSignedIn }: { onSignedIn: () => void }) {
  const [email, setEmail] = useState('demo@meridian.ng');
  const [password, setPassword] = useState('Meridian#2026');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setError('');
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check your email and password.');
      return;
    }
    setBusy(true);
    try {
      await login(parsed.data);
      onSignedIn();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'We could not sign you in.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-shell">
      <section className="login-story" aria-label="Meridian">
        <div className="login-brand">
          <span className="brand-mark" aria-hidden="true">M</span>
          <span className="brand-name">meridian</span>
        </div>

        <div className="login-story-copy">
          <p className="eyebrow eyebrow-brass">Private banking, plainly done</p>
          <h1 className="display display-xl">
            Your money,
            <br />
            held to a
            <br />
            higher ledger.
          </h1>
          <p className="login-lede">
            Naira-first current and savings accounts, instant transfers, and a statement that reconciles to the
            kobo. No noise, no surprises.
          </p>
        </div>

        <div className="login-story-foot">
          <div className="login-fact">
            <span className="login-fact-line" aria-hidden="true" />
            <div>
              <strong>Double-entry by design</strong>
              <span>Every movement is two legs and one balanced journal.</span>
            </div>
          </div>
          <div className="login-fact">
            <span className="login-fact-line" aria-hidden="true" />
            <div>
              <strong>Reconciled continuously</strong>
              <span>The cache is checked against the ledger, not trusted blindly.</span>
            </div>
          </div>
        </div>

        <p className="login-legal">Licensed by the Central Bank of Nigeria · Deposits insured by the NDIC</p>
      </section>

      <section className="login-panel">
        <div className="login-form-wrap">
          <p className="eyebrow">Welcome back</p>
          <h2 className="display">Sign in</h2>
          <p className="login-sub">Use the email and password on your Meridian account.</p>

          <form onSubmit={(event) => void submit(event)} noValidate>
            <label className="field" htmlFor="email">
              <span>Email address</span>
              <input
                id="email"
                type="email"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={busy}
                required
              />
            </label>

            <label className="field" htmlFor="password">
              <span>Password</span>
              <div className="password-wrap">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  disabled={busy}
                  required
                />
                <button
                  type="button"
                  className="text-button password-toggle"
                  onClick={() => setShowPassword((value) => !value)}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </label>

            {error && <p className="form-error" role="alert">{error}</p>}

            <button type="submit" className="button button-primary button-wide" disabled={busy}>
              {busy ? <><span className="spinner" aria-hidden="true" /> Signing in…</> : <>Sign in <IconArrowUpRight size={16} /></>}
            </button>
          </form>

          <div className="login-security">
            <IconShield size={16} />
            <span>Protected by rotating sessions and Argon2id password hashing.</span>
          </div>

          <div className="demo-note">
            <p className="demo-note-title">Demo access</p>
            <p><span className="mono">demo@meridian.ng</span> · <span className="mono">Meridian#2026</span></p>
          </div>
        </div>

        <p className="login-foot">© {new Date().getFullYear()} Meridian Bank · Support: support@meridian.ng</p>
      </section>
    </div>
  );
}
