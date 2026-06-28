import { useCallback, useMemo, useState } from 'react';
import { ArtifactAuthContext, type ArtifactAuthState, anonymousAuth } from '../hooks/useArtifactAuth';
import { authClient, clearAuthBearerToken, getArtifactAuthBaseUrl, readAuthBearerToken } from '../utils/authClient';

type AccountMode = 'sign-in' | 'sign-up';

export function ArtifactAuthProvider({ children }: { children: React.ReactNode }) {
  if (!getArtifactAuthBaseUrl()) {
    return <ArtifactAuthContext.Provider value={anonymousAuth}>{children}</ArtifactAuthContext.Provider>;
  }

  return <BetterAuthProvider>{children}</BetterAuthProvider>;
}

function BetterAuthProvider({ children }: { children: React.ReactNode }) {
  const session = authClient.useSession();
  const [accountPanelOpen, setAccountPanelOpen] = useState(false);

  const signOut = useCallback(async () => {
    try {
      await authClient.signOut();
    } finally {
      clearAuthBearerToken();
      await session.refetch();
    }
  }, [session]);

  const value = useMemo<ArtifactAuthState>(() => {
    const user = session.data?.user;
    return {
      configured: true,
      loaded: !session.isPending,
      signedIn: Boolean(user),
      userId: user?.id ?? null,
      email: user?.email ?? null,
      getToken: async () => readAuthBearerToken(),
      openSignIn: () => setAccountPanelOpen(true),
      signOut,
    };
  }, [session.data?.user, session.isPending, signOut]);

  return (
    <ArtifactAuthContext.Provider value={value}>
      {children}
      {accountPanelOpen ? (
        <AccountPanel onClose={() => setAccountPanelOpen(false)} onAuthenticated={() => session.refetch()} />
      ) : null}
    </ArtifactAuthContext.Provider>
  );
}

function AccountPanel({ onAuthenticated, onClose }: { onAuthenticated: () => Promise<void>; onClose: () => void }) {
  const [mode, setMode] = useState<AccountMode>('sign-in');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setPending(true);
      setError(null);

      let authenticated = false;
      try {
        const formData = new FormData(event.currentTarget);
        const email = String(formData.get('email') ?? '').trim();
        const password = String(formData.get('password') ?? '');
        const name = String(formData.get('name') ?? '').trim() || email.split('@')[0] || 'Artifact user';

        const result =
          mode === 'sign-up'
            ? await authClient.signUp.email({ email, password, name })
            : await authClient.signIn.email({ email, password, rememberMe: true });

        if (result.error) {
          setError(result.error.message || 'Could not authenticate.');
          return;
        }

        await onAuthenticated();
        authenticated = true;
      } catch (error) {
        setError(error instanceof Error ? error.message : 'Could not reach the account service.');
      } finally {
        setPending(false);
      }

      if (authenticated) onClose();
    },
    [mode, onAuthenticated, onClose],
  );

  return (
    <div className="account-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        aria-labelledby="account-modal-title"
        className="account-modal"
        role="dialog"
        aria-modal="true"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="account-modal-header">
          <div>
            <p className="account-modal-kicker">Artifact account</p>
            <h2 id="account-modal-title">{mode === 'sign-up' ? 'Create account' : 'Sign in'}</h2>
          </div>
          <button className="account-modal-close" type="button" onClick={onClose} aria-label="Close account panel">
            x
          </button>
        </div>

        <div className="account-mode-tabs" role="tablist" aria-label="Account mode">
          <button className={mode === 'sign-in' ? 'active' : ''} type="button" onClick={() => setMode('sign-in')}>
            Sign in
          </button>
          <button className={mode === 'sign-up' ? 'active' : ''} type="button" onClick={() => setMode('sign-up')}>
            Create
          </button>
        </div>

        <form className="account-form" onSubmit={handleSubmit}>
          {mode === 'sign-up' ? (
            <label>
              <span>Name</span>
              <input autoComplete="name" name="name" placeholder="Artist name" />
            </label>
          ) : null}
          <label>
            <span>Email</span>
            <input autoComplete="email" name="email" placeholder="you@example.com" required type="email" />
          </label>
          <label>
            <span>Password</span>
            <input
              autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
              name="password"
              required
              type="password"
            />
          </label>

          {error ? <p className="account-form-error">{error}</p> : null}

          <button className="account-submit" disabled={pending} type="submit">
            {pending ? 'Working' : mode === 'sign-up' ? 'Create account' : 'Sign in'}
          </button>
        </form>
      </section>
    </div>
  );
}
