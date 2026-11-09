import { useCallback, useEffect, useState } from 'react';
import { logout, restoreSession, type SignedInUser } from './api/client.js';
import { AppProvider } from './app/AppContext.js';
import { useRoute } from './app/useRoute.js';
import { Shell } from './components/Shell.js';
import { Overview } from './pages/Overview.js';
import { Accounts } from './pages/Accounts.js';
import { Transfers } from './pages/Transfers.js';
import { Activity } from './pages/Activity.js';
import { Beneficiaries } from './pages/Beneficiaries.js';
import { Settings } from './pages/Settings.js';
import { Login } from './pages/Login.js';

export default function App() {
  const [user, setUser] = useState<SignedInUser | null>(null);
  const [checking, setChecking] = useState(true);
  const { route, navigate } = useRoute();

  useEffect(() => {
    let active = true;
    void restoreSession()
      .then((session) => {
        if (active && session) setUser(session.user);
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const signedIn = useCallback(() => {
    void restoreSession().then((session) => {
      if (session) setUser(session.user);
    });
  }, []);

  const signOut = useCallback(() => {
    void logout().finally(() => {
      setUser(null);
      window.location.hash = '/overview';
    });
  }, []);

  if (checking) {
    return (
      <div className="boot">
        <span className="brand-mark" aria-hidden="true">M</span>
        <p>Opening your secure session…</p>
      </div>
    );
  }

  if (!user) return <Login onSignedIn={signedIn} />;

  return (
    <AppProvider user={user} onSignOut={signOut}>
      <Shell route={route} navigate={navigate}>
        {route === 'overview' && <Overview key="overview" navigate={navigate} />}
        {route === 'accounts' && <Accounts key="accounts" navigate={navigate} />}
        {route === 'transfer' && <Transfers key="transfer" navigate={navigate} />}
        {route === 'activity' && <Activity key="activity" />}
        {route === 'payees' && <Beneficiaries key="payees" navigate={navigate} />}
        {route === 'settings' && <Settings key="settings" />}
      </Shell>
    </AppProvider>
  );
}
