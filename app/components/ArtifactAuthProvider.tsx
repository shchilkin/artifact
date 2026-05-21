import { ClerkProvider, useAuth, useClerk, useUser } from '@clerk/react-router';
import { useMemo } from 'react';
import {
  ArtifactAuthContext,
  type ArtifactAuthState,
  anonymousAuth,
  getClerkPublishableKey,
} from '../hooks/useArtifactAuth';

function ClerkAuthBridge({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const { getToken, isLoaded, isSignedIn, signOut, userId } = auth;
  const clerk = useClerk();
  const { user } = useUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? null;
  const value = useMemo<ArtifactAuthState>(
    () => ({
      configured: true,
      loaded: isLoaded,
      signedIn: Boolean(isSignedIn),
      userId: userId ?? null,
      email,
      getToken: async () => getToken(),
      openSignIn: () => {
        void clerk.openSignIn();
      },
      signOut: async () => {
        await signOut();
      },
    }),
    [clerk, email, getToken, isLoaded, isSignedIn, signOut, userId],
  );

  return <ArtifactAuthContext.Provider value={value}>{children}</ArtifactAuthContext.Provider>;
}

export function ArtifactAuthProvider({ children }: { children: React.ReactNode }) {
  const publishableKey = getClerkPublishableKey();
  if (!publishableKey) {
    return <ArtifactAuthContext.Provider value={anonymousAuth}>{children}</ArtifactAuthContext.Provider>;
  }

  return (
    <ClerkProvider publishableKey={publishableKey}>
      <ClerkAuthBridge>{children}</ClerkAuthBridge>
    </ClerkProvider>
  );
}
