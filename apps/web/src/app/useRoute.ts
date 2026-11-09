import { useEffect, useState } from 'react';

export type Route = 'overview' | 'accounts' | 'transfer' | 'activity' | 'payees' | 'settings';

const ROUTES: readonly Route[] = ['overview', 'accounts', 'transfer', 'activity', 'payees', 'settings'];

function readRoute(): Route {
  const hash = window.location.hash.replace(/^#\/?/, '').split('?')[0];
  return (ROUTES as readonly string[]).includes(hash ?? '') ? (hash as Route) : 'overview';
}

export function useRoute(): { route: Route; navigate: (route: Route) => void } {
  const [route, setRoute] = useState<Route>(readRoute);

  useEffect(() => {
    const onChange = () => {
      setRoute(readRoute());
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  return {
    route,
    navigate: (next: Route) => {
      window.location.hash = `/${next}`;
    },
  };
}
