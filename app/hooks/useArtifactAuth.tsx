import { createContext, useContext } from 'react';

export interface ArtifactAuthState {
  configured: boolean;
  loaded: boolean;
  signedIn: boolean;
  userId: string | null;
  email: string | null;
  getToken: () => Promise<string | null>;
  openSignIn: () => void;
  signOut: () => Promise<void>;
}

export const anonymousAuth: ArtifactAuthState = {
  configured: false,
  loaded: true,
  signedIn: false,
  userId: null,
  email: null,
  getToken: async () => null,
  openSignIn: () => undefined,
  signOut: async () => undefined,
};

export const ArtifactAuthContext = createContext<ArtifactAuthState>(anonymousAuth);

export function getClerkPublishableKey() {
  return (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_CLERK_PUBLISHABLE_KEY;
}

export function useArtifactAuth() {
  return useContext(ArtifactAuthContext);
}
