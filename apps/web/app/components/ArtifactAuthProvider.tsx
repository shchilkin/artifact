import { Field, InlineNotice, Input } from '@artifact/ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArtifactAuthContext, type ArtifactAuthState, anonymousAuth } from '../hooks/useArtifactAuth';
import {
  authClient,
  clearAuthBearerToken,
  getArtifactAuthBaseUrl,
  readAuthBearerToken,
  requestArtifactPasswordReset,
} from '../utils/authClient';
import { ActionButton } from './ui/ActionButton';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from './ui/dialog';
import { IconButton } from './ui/IconButton';

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

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        ref={dialogRef}
        className="account-modal"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          dialogRef.current?.querySelector<HTMLElement>('[data-account-initial-focus]')?.focus();
        }}
      >
        <div className="account-modal-header">
          <div>
            <p className="account-modal-kicker">Artifact account</p>
            <DialogTitle className="account-modal-title">{accountModeTitle[mode]}</DialogTitle>
            <DialogDescription className="account-modal-body">{accountModeBody[mode]}</DialogDescription>
          </div>
          <DialogClose asChild>
            <IconButton className="account-modal-close" label="Close account panel" icon="×" />
          </DialogClose>
        </div>

        <div className="account-mode-tabs" role="group" aria-label="Account mode">
          <ActionButton
            aria-pressed={mode === 'sign-in'}
            className={mode === 'sign-in' ? 'active' : ''}
            onClick={() => updateMode('sign-in')}
            variant="quiet"
          >
            Sign in
          </ActionButton>
          <ActionButton
            aria-pressed={mode === 'sign-up'}
            className={mode === 'sign-up' ? 'active' : ''}
            onClick={() => updateMode('sign-up')}
            variant="quiet"
          >
            Create
          </ActionButton>
        </div>

        <form aria-label={accountModeTitle[mode]} className="account-form" onSubmit={handleSubmit}>
          {mode === 'sign-up' ? (
            <Field label="Name">
              <Input autoComplete="name" name="name" placeholder="Artist name" />
            </Field>
          ) : null}
          <Field label="Email">
            <Input
              autoComplete="email"
              data-account-initial-focus
              name="email"
              placeholder="you@example.com"
              required
              type="email"
            />
          </Field>
          {mode !== 'recover' ? (
            <Field label="Password">
              <Input
                autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
                name="password"
                required
                type="password"
              />
            </Field>
          ) : null}
          {mode === 'sign-up' ? (
            <Field label="Confirm password">
              <Input autoComplete="new-password" name="confirmPassword" required type="password" />
            </Field>
          ) : null}

          {mode === 'sign-in' ? (
            <ActionButton
              className="account-inline-action"
              size="compact"
              onClick={() => updateMode('recover')}
              variant="quiet"
            >
              Forgot password?
            </ActionButton>
          ) : null}

          {error ? (
            <InlineNotice className="account-form-error" variant="danger">
              {error}
            </InlineNotice>
          ) : null}
          {notice ? (
            <InlineNotice className="account-form-notice" variant="success">
              {notice}
            </InlineNotice>
          ) : null}

          <ActionButton className="account-submit" loading={pending} type="submit" variant="primary">
            {pending ? 'Working' : mode === 'recover' ? 'Send reset link' : accountModeTitle[mode]}
          </ActionButton>
          {mode === 'recover' ? (
            <ActionButton className="account-secondary-action" onClick={() => updateMode('sign-in')} variant="quiet">
              Back to sign in
            </ActionButton>
          ) : null}
        </form>
      </DialogContent>
    </Dialog>
  );
}

function passwordResetRedirectUrl() {
  if (typeof window === 'undefined') return '/reset-password';
  return new URL('/reset-password', window.location.origin).toString();
}
