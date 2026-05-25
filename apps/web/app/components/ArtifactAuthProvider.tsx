import { ClerkProvider, useAuth, useClerk, useUser } from '@clerk/react-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArtifactAuthContext,
  type ArtifactAuthState,
  anonymousAuth,
  getClerkPublishableKey,
} from '../hooks/useArtifactAuth';
import { getClerkBrowserScriptUrl } from '../utils/clerkAuth';

const CLERK_SCRIPT_TIMEOUT_MS = 4_000;
const CLERK_AUTH_LOAD_TIMEOUT_MS = 8_000;

type ClerkScriptStatus = 'checking' | 'available' | 'unavailable';

interface ClerkAvailability {
  authUnavailable: boolean;
  key: string;
  scriptStatus: ClerkScriptStatus;
}

function getBrowserClerkGlobal() {
  return typeof window === 'undefined' ? undefined : (window as Window & { Clerk?: unknown }).Clerk;
}

function preloadClerkBrowserScript(publishableKey: string, onAvailable: () => void, onUnavailable: () => void) {
  if (typeof document === 'undefined') {
    onUnavailable();
    return () => undefined;
  }

  if (getBrowserClerkGlobal()) {
    onAvailable();
    return () => undefined;
  }

  const src = getClerkBrowserScriptUrl(publishableKey);
  if (!src) {
    onUnavailable();
    return () => undefined;
  }

  const existingScript = document.querySelector<HTMLScriptElement>('script[data-clerk-js-script]');
  const script = existingScript?.src === src ? existingScript : document.createElement('script');
  const createdScript = !existingScript || existingScript.src !== src;
  let settled = false;

  const settle = (status: Exclude<ClerkScriptStatus, 'checking'>) => {
    if (settled) return;
    settled = true;
    window.clearTimeout(timeout);
    script.removeEventListener('load', handleLoad);
    script.removeEventListener('error', handleError);
    if (status === 'available') onAvailable();
    else {
      if (createdScript) script.remove();
      onUnavailable();
    }
  };

  const handleLoad = () => settle('available');
  const handleError = () => settle('unavailable');
  const timeout = window.setTimeout(() => settle('unavailable'), CLERK_SCRIPT_TIMEOUT_MS);

  script.addEventListener('load', handleLoad);
  script.addEventListener('error', handleError);

  if (createdScript) {
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.src = src;
    script.dataset.clerkJsScript = 'true';
    script.dataset.clerkPublishableKey = publishableKey;
    document.head.appendChild(script);
  }

  return () => {
    if (settled) return;
    settled = true;
    window.clearTimeout(timeout);
    script.removeEventListener('load', handleLoad);
    script.removeEventListener('error', handleError);
    if (createdScript) script.remove();
  };
}

function ClerkAuthBridge({ children, onUnavailable }: { children: React.ReactNode; onUnavailable: () => void }) {
  const auth = useAuth();
  const { getToken, isLoaded, isSignedIn, signOut, userId } = auth;
  const clerk = useClerk();
  const { user } = useUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? null;

  useEffect(() => {
    if (isLoaded) return undefined;
    const timeout = window.setTimeout(onUnavailable, CLERK_AUTH_LOAD_TIMEOUT_MS);
    return () => window.clearTimeout(timeout);
  }, [isLoaded, onUnavailable]);

  const value = useMemo<ArtifactAuthState>(
    () => ({
      configured: true,
      loaded: isLoaded,
      signedIn: Boolean(isSignedIn),
      userId: userId ?? null,
      email,
      getToken: async () => {
        try {
          return await getToken();
        } catch {
          onUnavailable();
          return null;
        }
      },
      openSignIn: () => {
        try {
          void Promise.resolve(clerk.openSignIn()).catch(onUnavailable);
        } catch {
          onUnavailable();
        }
      },
      signOut: async () => {
        try {
          await signOut();
        } catch {
          onUnavailable();
        }
      },
    }),
    [clerk, email, getToken, isLoaded, isSignedIn, onUnavailable, signOut, userId],
  );

  return <ArtifactAuthContext.Provider value={value}>{children}</ArtifactAuthContext.Provider>;
}

export function ArtifactAuthProvider({ children }: { children: React.ReactNode }) {
  const publishableKey = getClerkPublishableKey();
  const authKey = publishableKey ?? '';
  const [availability, setAvailability] = useState<ClerkAvailability>(() => ({
    authUnavailable: false,
    key: authKey,
    scriptStatus: publishableKey ? 'checking' : 'unavailable',
  }));
  const currentAvailability =
    availability.key === authKey
      ? availability
      : {
          authUnavailable: false,
          key: authKey,
          scriptStatus: publishableKey ? 'checking' : ('unavailable' as const),
        };

  useEffect(() => {
    if (!publishableKey) return undefined;

    return preloadClerkBrowserScript(
      publishableKey,
      () => setAvailability({ authUnavailable: false, key: authKey, scriptStatus: 'available' }),
      () => setAvailability({ authUnavailable: false, key: authKey, scriptStatus: 'unavailable' }),
    );
  }, [authKey, publishableKey]);

  const handleUnavailable = useCallback(() => {
    setAvailability((current) => (current.key === authKey ? { ...current, authUnavailable: true } : current));
  }, [authKey]);

  if (!publishableKey || currentAvailability.scriptStatus !== 'available' || currentAvailability.authUnavailable) {
    return <ArtifactAuthContext.Provider value={anonymousAuth}>{children}</ArtifactAuthContext.Provider>;
  }

  return (
    <ClerkProvider publishableKey={publishableKey} prefetchUI={false}>
      <ClerkAuthBridge onUnavailable={handleUnavailable}>{children}</ClerkAuthBridge>
    </ClerkProvider>
  );
}
