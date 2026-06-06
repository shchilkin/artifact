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
  if (clerkBrowserUnavailable(onUnavailable)) return () => undefined;
  if (clerkBrowserAlreadyLoaded(onAvailable)) return () => undefined;

  const src = getClerkBrowserScriptUrl(publishableKey);
  if (!src) return notifyClerkUnavailable(onUnavailable);
  return attachClerkBrowserScript(src, publishableKey, onAvailable, onUnavailable);
}

function attachClerkBrowserScript(
  src: string,
  publishableKey: string,
  onAvailable: () => void,
  onUnavailable: () => void,
) {
  const { script, createdScript } = clerkScriptTarget(src);
  let settled = false;

  const settle = (status: Exclude<ClerkScriptStatus, 'checking'>) => {
    settled = settleClerkScript(status, settled, {
      createdScript,
      handleError,
      handleLoad,
      onAvailable,
      onUnavailable,
      script,
      timeout,
    });
  };

  const handleLoad = () => settle('available');
  const handleError = () => settle('unavailable');
  const timeout = window.setTimeout(() => settle('unavailable'), CLERK_SCRIPT_TIMEOUT_MS);

  script.addEventListener('load', handleLoad);
  script.addEventListener('error', handleError);
  appendClerkScriptIfNeeded(script, src, publishableKey, createdScript);

  return () => {
    settled = cleanupPendingClerkScript(settled, {
      createdScript,
      handleError,
      handleLoad,
      script,
      timeout,
    });
  };
}

function clerkScriptTarget(src: string) {
  const existingScript = document.querySelector<HTMLScriptElement>('script[data-clerk-js-script]');
  if (existingScript?.src === src) return { script: existingScript, createdScript: false };
  return { script: document.createElement('script'), createdScript: true };
}

function appendClerkScriptIfNeeded(
  script: HTMLScriptElement,
  src: string,
  publishableKey: string,
  createdScript: boolean,
) {
  if (!createdScript) return;
  script.async = true;
  script.crossOrigin = 'anonymous';
  script.src = src;
  script.dataset.clerkJsScript = 'true';
  script.dataset.clerkPublishableKey = publishableKey;
  document.head.appendChild(script);
}

function cleanupPendingClerkScript(
  settled: boolean,
  options: {
    createdScript: boolean;
    handleError: () => void;
    handleLoad: () => void;
    script: HTMLScriptElement;
    timeout: number;
  },
) {
  if (settled) return true;
  window.clearTimeout(options.timeout);
  removeClerkScriptListeners(options.script, options.handleLoad, options.handleError);
  if (options.createdScript) options.script.remove();
  return true;
}

function settleClerkScript(
  status: Exclude<ClerkScriptStatus, 'checking'>,
  settled: boolean,
  options: {
    createdScript: boolean;
    handleError: () => void;
    handleLoad: () => void;
    onAvailable: () => void;
    onUnavailable: () => void;
    script: HTMLScriptElement;
    timeout: number;
  },
) {
  if (settled) return true;
  window.clearTimeout(options.timeout);
  removeClerkScriptListeners(options.script, options.handleLoad, options.handleError);
  notifyClerkScriptStatus(status, options.createdScript, options.script, options.onAvailable, options.onUnavailable);
  return true;
}

function removeClerkScriptListeners(script: HTMLScriptElement, handleLoad: () => void, handleError: () => void) {
  script.removeEventListener('load', handleLoad);
  script.removeEventListener('error', handleError);
}

function notifyClerkScriptStatus(
  status: Exclude<ClerkScriptStatus, 'checking'>,
  createdScript: boolean,
  script: HTMLScriptElement,
  onAvailable: () => void,
  onUnavailable: () => void,
) {
  if (status === 'available') onAvailable();
  else {
    if (createdScript) script.remove();
    onUnavailable();
  }
}

function clerkBrowserUnavailable(onUnavailable: () => void) {
  if (typeof document !== 'undefined') return false;
  onUnavailable();
  return true;
}

function clerkBrowserAlreadyLoaded(onAvailable: () => void) {
  if (!getBrowserClerkGlobal()) return false;
  onAvailable();
  return true;
}

function notifyClerkUnavailable(onUnavailable: () => void) {
  onUnavailable();
  return () => undefined;
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
  const currentAvailability = currentClerkAvailability(availability, authKey, publishableKey);

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

  if (anonymousAuthRequired(publishableKey, currentAvailability)) {
    return <ArtifactAuthContext.Provider value={anonymousAuth}>{children}</ArtifactAuthContext.Provider>;
  }

  return (
    <ClerkProvider publishableKey={publishableKey} prefetchUI={false}>
      <ClerkAuthBridge onUnavailable={handleUnavailable}>{children}</ClerkAuthBridge>
    </ClerkProvider>
  );
}

function currentClerkAvailability(
  availability: ClerkAvailability,
  authKey: string,
  publishableKey: string | undefined,
): ClerkAvailability {
  return availability.key === authKey
    ? availability
    : {
        authUnavailable: false,
        key: authKey,
        scriptStatus: publishableKey ? 'checking' : 'unavailable',
      };
}

function anonymousAuthRequired(publishableKey: string | undefined, availability: ClerkAvailability) {
  return !publishableKey || availability.scriptStatus !== 'available' || availability.authUnavailable;
}
