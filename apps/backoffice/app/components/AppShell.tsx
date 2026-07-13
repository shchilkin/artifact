import { NavLink, Outlet, useNavigate, useNavigation } from 'react-router';
import { authClient, clearAuthBearerToken } from '../lib/authClient';

const navigationItems = [
  { to: '/', label: 'Overview', end: true },
  { to: '/accounts', label: 'Accounts', end: false },
  { to: '/usage', label: 'Provider usage', end: false },
] as const;

export function AppShell() {
  const navigation = useNavigation();
  const navigate = useNavigate();

  const signOut = async () => {
    try {
      await authClient.signOut();
    } finally {
      clearAuthBearerToken();
      await navigate('/sign-in', { replace: true });
    }
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <NavLink className="brand" to="/" aria-label="Artifact Backoffice overview">
          <span className="brand-mark" aria-hidden="true">
            A
          </span>
          <span>
            <strong>artifact</strong>
            <small>backoffice</small>
          </span>
        </NavLink>
        <nav className="primary-nav" aria-label="Backoffice">
          {navigationItems.map((item) => (
            <NavLink
              key={item.to}
              className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
              end={item.end}
              to={item.to}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <button className="quiet-button sign-out" type="button" onClick={() => void signOut()}>
          Sign out
        </button>
      </header>
      <div className={navigation.state === 'idle' ? 'load-rail' : 'load-rail active'} aria-hidden="true" />
      <div className="navigation-status" aria-live="polite">
        {navigation.state === 'loading' ? 'Refreshing data' : navigation.state === 'submitting' ? 'Saving change' : ''}
      </div>
      <main className="workspace">
        <Outlet />
      </main>
    </div>
  );
}
