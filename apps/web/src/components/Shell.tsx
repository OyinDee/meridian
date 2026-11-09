import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useApp } from '../app/AppContext.js';
import type { Route } from '../app/useRoute.js';
import { fullDate, initials, timeOf } from '../lib/format.js';
import {
  IconArrows,
  IconBell,
  IconGrid,
  IconLogout,
  IconReceipt,
  IconSearch,
  IconSettings,
  IconUsers,
  IconWallet,
} from './Icons.js';

const NAV: readonly { route: Route; label: string; icon: typeof IconGrid }[] = [
  { route: 'overview', label: 'Overview', icon: IconGrid },
  { route: 'accounts', label: 'Accounts', icon: IconWallet },
  { route: 'transfer', label: 'Send money', icon: IconArrows },
  { route: 'activity', label: 'Activity', icon: IconReceipt },
  { route: 'payees', label: 'Payees', icon: IconUsers },
];

const TITLES: Record<Route, { title: string; eyebrow: string }> = {
  overview: { title: 'Overview', eyebrow: 'Your money at a glance' },
  accounts: { title: 'Accounts', eyebrow: 'Current, savings and settlement' },
  transfer: { title: 'Send money', eyebrow: 'Transfers settle instantly' },
  activity: { title: 'Activity', eyebrow: 'Every entry in your ledger' },
  payees: { title: 'Payees', eyebrow: 'People and businesses you pay' },
  settings: { title: 'Settings', eyebrow: 'Profile and security' },
};

export function Shell({
  route,
  navigate,
  children,
}: {
  route: Route;
  navigate: (route: Route) => void;
  children: ReactNode;
}) {
  const { user, signOut } = useApp();
  const [search, setSearch] = useState('');
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const meta = TITLES[route];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand brand-button" type="button" onClick={() => navigate('overview')}>
          <span className="brand-mark" aria-hidden="true">
            M
          </span>
          <span className="brand-words">
            <span className="brand-name">meridian</span>
            <span className="brand-sub">online banking</span>
          </span>
        </button>

        <nav className="nav" aria-label="Main">
          <p className="nav-heading">Banking</p>
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = route === item.route;
            return (
              <button
                key={item.route}
                type="button"
                className={`nav-item${active ? ' is-active' : ''}`}
                aria-current={active ? 'page' : undefined}
                onClick={() => navigate(item.route)}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}

          <p className="nav-heading">Account</p>
          <button
            type="button"
            className={`nav-item${route === 'settings' ? ' is-active' : ''}`}
            aria-current={route === 'settings' ? 'page' : undefined}
            onClick={() => navigate('settings')}
          >
            <IconSettings size={18} />
            <span>Settings</span>
          </button>
        </nav>

        <div className="sidebar-foot">
          <div className="sidebar-note">
            <p className="sidebar-note-title">Deposits insured</p>
            <p className="sidebar-note-body">Your balances are covered up to NGN 500,000 by the NDIC.</p>
          </div>
          <button type="button" className="user-chip" onClick={() => navigate('settings')}>
            <span className="avatar">{initials(user.firstName, user.lastName)}</span>
            <span className="user-chip-words">
              <span className="user-chip-name">
                {user.firstName} {user.lastName}
              </span>
              <span className="user-chip-meta">Personal account</span>
            </span>
          </button>
          <button type="button" className="nav-item nav-item-quiet" onClick={signOut}>
            <IconLogout size={18} />
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      <div className="app-main">
        <header className="topbar">
          <div className="topbar-title">
            <p className="topbar-eyebrow">{meta.eyebrow}</p>
            <h1>{meta.title}</h1>
          </div>

          <div className="topbar-actions">
            <form
              className="search"
              role="search"
              onSubmit={(event) => {
                event.preventDefault();
                window.location.hash = `/activity?q=${encodeURIComponent(search.trim())}`;
              }}
            >
              <IconSearch size={16} />
              <input
                type="search"
                aria-label="Search transactions"
                placeholder="Search activity"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </form>

            <NotificationBell
              open={notificationsOpen}
              onToggle={() => setNotificationsOpen((value) => !value)}
              onClose={() => setNotificationsOpen(false)}
            />

            <button type="button" className="avatar avatar-button" onClick={() => navigate('settings')} aria-label="Open settings">
              {initials(user.firstName, user.lastName)}
            </button>
          </div>
        </header>

        <main className="content">{children}</main>

        <footer className="app-foot">
          <span>© {new Date().getFullYear()} Meridian Bank</span>
          <span className="app-foot-date">{fullDate(new Date().toISOString())}</span>
        </footer>
      </div>

      <nav className="mobile-nav" aria-label="Main">
        {NAV.map((item) => {
          const Icon = item.icon;
          const active = route === item.route;
          return (
            <button
              key={item.route}
              type="button"
              className={`mobile-nav-item${active ? ' is-active' : ''}`}
              aria-current={active ? 'page' : undefined}
              onClick={() => navigate(item.route)}
            >
              <Icon size={20} />
              <span>{item.label}</span>
            </button>
          );
        })}
        <button
          type="button"
          className={`mobile-nav-item${route === 'settings' ? ' is-active' : ''}`}
          onClick={() => navigate('settings')}
        >
          <IconSettings size={20} />
          <span>Settings</span>
        </button>
      </nav>
    </div>
  );
}

function NotificationBell({
  open,
  onToggle,
  onClose,
}: {
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  const { notifications, unread, markNotificationsRead } = useApp();
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <div className="notification-wrap">
      <button
        type="button"
        className="icon-button"
        onClick={onToggle}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-expanded={open}
      >
        <IconBell size={19} />
        {unread > 0 && <span className="dot" aria-hidden="true" />}
      </button>

      {open && (
        <>
          <button type="button" className="popover-scrim" aria-label="Close notifications" onClick={onClose} />
          <div className="popover" ref={panel} role="dialog" aria-label="Notifications">
            <div className="popover-head">
              <h2>Notifications</h2>
              {unread > 0 && (
                <button type="button" className="text-button" onClick={() => void markNotificationsRead()}>
                  Mark all read
                </button>
              )}
            </div>
            {notifications.length === 0 ? (
              <p className="popover-empty">Nothing new. Transfers and deposits will appear here.</p>
            ) : (
              <ul className="notification-list">
                {notifications.slice(0, 6).map((item) => (
                  <li key={item.id} className={item.read ? '' : 'is-unread'}>
                    <span className="notification-dot" aria-hidden="true" />
                    <div>
                      <p className="notification-title">{item.title}</p>
                      <p className="notification-body">{item.body}</p>
                      <p className="notification-time">{timeOf(item.createdAt)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
