import { lazy, Suspense, useCallback, useMemo, useState } from 'react';
import { ArtifactAuthContext, type ArtifactAuthState, anonymousAuth } from '../hooks/useArtifactAuth';
import { authClient, clearAuthBearerToken, getArtifactAuthBaseUrl, readAuthBearerToken } from '../utils/authClient';

// The account dialog loads only when someone opens it, so it stays out of every route's initial graph.
const AccountPanel = lazy(() => import('./AccountPanel'));

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
        <Suspense fallback={null}>
          <AccountPanel onClose={() => setAccountPanelOpen(false)} onAuthenticated={() => session.refetch()} />
        </Suspense>
      ) : null}
    </ArtifactAuthContext.Provider>
  );
}
