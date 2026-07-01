import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArtifactAuthContext, type ArtifactAuthState, anonymousAuth } from '../hooks/useArtifactAuth';
import {
  authClient,
  clearAuthBearerToken,
  getArtifactAuthBaseUrl,
  readAuthBearerToken,
  requestArtifactPasswordReset,
} from '../utils/authClient';

type AccountMode = 'recover' | 'sign-in' | 'sign-up';

const accountModeTitle: Record<AccountMode, string> = {
  'sign-in': 'Sign in',
  'sign-up': 'Create account',
  recover: 'Reset password',
};

const accountModeBody: Record<AccountMode, string> = {
  'sign-in': 'Open cloud projects and keep your work available across browsers.',
  'sign-up': 'Create an account to sync projects and preserve your work outside this browser.',
  recover: 'Enter your account email and we will send a link to choose a new password.',
};

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
  const dialogRef = useRef<HTMLElement | null>(null);
  const [mode, setMode] = useState<AccountMode>('sign-in');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const updateMode = (nextMode: AccountMode) => {
    setMode(nextMode);
    setError(null);
    setNotice(null);
  };

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const initialFocus = dialogRef.current?.querySelector<HTMLElement>('[data-account-initial-focus]');
    initialFocus?.focus();
    return () => previousFocus?.focus();
  }, []);

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setPending(true);
      setError(null);
      setNotice(null);

      let authenticated = false;
      try {
        const formData = new FormData(event.currentTarget);
        const email = String(formData.get('email') ?? '').trim();
        const password = String(formData.get('password') ?? '');
        const confirmPassword = String(formData.get('confirmPassword') ?? '');
        const name = String(formData.get('name') ?? '').trim() || email.split('@')[0] || 'Artifact user';

        if (mode === 'recover') {
          const result = await requestArtifactPasswordReset({
            email,
            redirectTo: passwordResetRedirectUrl(),
          });

          if (result.error) {
            setError(result.error.message || 'Could not start password recovery.');
            return;
          }

          setNotice('If an account exists for that email, a reset link is on its way.');
          return;
        }

        if (mode === 'sign-up' && password !== confirmPassword) {
          setError('Passwords do not match.');
          return;
        }

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

  const handleDialogKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLElement>) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }

      if (event.key === 'Tab') trapDialogFocus(event, dialogRef.current);
    },
    [onClose],
  );

  return (
    <div className="account-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        ref={dialogRef}
        aria-labelledby="account-modal-title"
        aria-describedby="account-modal-body"
        className="account-modal"
        role="dialog"
        aria-modal="true"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={handleDialogKeyDown}
      >
        <div className="account-modal-header">
          <div>
            <p className="account-modal-kicker">Artifact account</p>
            <h2 id="account-modal-title">{accountModeTitle[mode]}</h2>
            <p className="account-modal-body" id="account-modal-body">
              {accountModeBody[mode]}
            </p>
          </div>
          <button className="account-modal-close" type="button" onClick={onClose} aria-label="Close account panel">
            x
          </button>
        </div>

        <div className="account-mode-tabs" role="group" aria-label="Account mode">
          <button className={mode === 'sign-in' ? 'active' : ''} type="button" onClick={() => updateMode('sign-in')}>
            Sign in
          </button>
          <button className={mode === 'sign-up' ? 'active' : ''} type="button" onClick={() => updateMode('sign-up')}>
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
            <input
              autoComplete="email"
              data-account-initial-focus
              name="email"
              placeholder="you@example.com"
              required
              type="email"
            />
          </label>
          {mode !== 'recover' ? (
            <label>
              <span>Password</span>
              <input
                autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
                name="password"
                required
                type="password"
              />
            </label>
          ) : null}
          {mode === 'sign-up' ? (
            <label>
              <span>Confirm password</span>
              <input autoComplete="new-password" name="confirmPassword" required type="password" />
            </label>
          ) : null}

          {mode === 'sign-in' ? (
            <button className="account-inline-action" type="button" onClick={() => updateMode('recover')}>
              Forgot password?
            </button>
          ) : null}

          {error ? (
            <p className="account-form-error" role="alert">
              {error}
            </p>
          ) : null}
          {notice ? (
            <p className="account-form-notice" role="status">
              {notice}
            </p>
          ) : null}

          <button className="account-submit" disabled={pending} type="submit">
            {pending ? 'Working' : mode === 'recover' ? 'Send reset link' : accountModeTitle[mode]}
          </button>
          {mode === 'recover' ? (
            <button className="account-secondary-action" type="button" onClick={() => updateMode('sign-in')}>
              Back to sign in
            </button>
          ) : null}
        </form>
      </section>
    </div>
  );
}

function passwordResetRedirectUrl() {
  if (typeof window === 'undefined') return '/reset-password';
  return new URL('/reset-password', window.location.origin).toString();
}

function trapDialogFocus(event: React.KeyboardEvent<HTMLElement>, dialog: HTMLElement | null) {
  if (!dialog) return;
  const focusableElements = Array.from(
    dialog.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => element.offsetParent !== null);

  if (focusableElements.length === 0) return;

  const first = focusableElements[0];
  const last = focusableElements[focusableElements.length - 1];
  const activeElement = document.activeElement;

  if (event.shiftKey && activeElement === first) {
    event.preventDefault();
    last.focus();
    return;
  }

  if (!event.shiftKey && activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}
