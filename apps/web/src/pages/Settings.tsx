import { useApp } from '../app/AppContext.js';
import { fullDate, initials, money } from '../lib/format.js';
import { IconLogout, IconShield, IconWallet } from '../components/Icons.js';

export function Settings() {
  const { user, accounts, summary, signOut } = useApp();

  return (
    <div className="page">
      <section className="page-intro">
        <div>
          <p className="eyebrow">Your profile</p>
          <h2 className="display">Settings</h2>
          <p className="intro-copy">Identity, security and the accounts linked to this sign-in.</p>
        </div>
      </section>

      <div className="settings-grid">
        <section className="panel profile-panel">
          <div className="profile-head">
            <span className="avatar avatar-xl">{initials(user.firstName, user.lastName)}</span>
            <div>
              <h3>{user.firstName} {user.lastName}</h3>
              <p>{user.email}</p>
              <span className={`chip${user.kycStatus === 'VERIFIED' ? ' chip-success' : ''}`}>
                {user.kycStatus === 'VERIFIED' ? 'Identity verified' : 'Verification pending'}
              </span>
            </div>
          </div>

          <dl className="detail-list">
            <div><dt>Phone</dt><dd>{user.phone}</dd></div>
            <div><dt>Role</dt><dd>{user.role.charAt(0) + user.role.slice(1).toLowerCase()}</dd></div>
            <div><dt>Customer since</dt><dd>{fullDate(user.createdAt)}</dd></div>
            <div><dt>Customer ID</dt><dd className="mono">{user.id.slice(0, 8)}</dd></div>
          </dl>

          <button type="button" className="button button-ghost button-danger" onClick={signOut}>
            <IconLogout size={16} /> Sign out of this device
          </button>
        </section>

        <section className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Linked</p>
              <h3>Accounts</h3>
            </div>
            <span className="chip">{summary?.accountCount ?? accounts.length}</span>
          </div>
          <ul className="account-list">
            {accounts.map((account) => (
              <li key={account.id}>
                <div className="account-row account-row-static">
                  <span className="account-icon" aria-hidden="true"><IconWallet size={18} /></span>
                  <span className="account-words">
                    <span className="account-name">{account.nickname ?? account.type}</span>
                    <span className="account-number mono">{account.accountNumber}</span>
                  </span>
                  <span className="account-balance">{money(account.balanceMinor, account.currency)}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel security-panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Security</p>
              <h3>How your account is protected</h3>
            </div>
            <IconShield size={22} />
          </div>
          <ul className="security-list">
            <li>
              <strong>Double-entry ledger</strong>
              <span>Every balance change is a balanced journal, hash-chained so edits are detectable.</span>
            </li>
            <li>
              <strong>Rotating sessions</strong>
              <span>Refresh tokens rotate on every use; replaying an old one revokes the whole session family.</span>
            </li>
            <li>
              <strong>Argon2id passwords</strong>
              <span>Passwords are stored with a memory-hard hash, never in a reversible form.</span>
            </li>
            <li>
              <strong>Step-up on large payments</strong>
              <span>Transfers above the threshold require a fresh authenticator code.</span>
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}
