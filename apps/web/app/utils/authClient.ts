import { createAuthClient } from 'better-auth/react';

export const AUTH_BEARER_TOKEN_KEY = 'artifact-better-auth-token';

function env() {
  return (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
}

export function getArtifactAuthBaseUrl() {
  return env().VITE_AUTH_API_BASE_URL;
}

export function readAuthBearerToken() {
  if (typeof localStorage === 'undefined') return null;
  return localStorage.getItem(AUTH_BEARER_TOKEN_KEY);
}

export function persistAuthBearerToken(token: string | null) {
  if (typeof localStorage === 'undefined' || !token) return;
  localStorage.setItem(AUTH_BEARER_TOKEN_KEY, token);
}

export function clearAuthBearerToken() {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(AUTH_BEARER_TOKEN_KEY);
}

export const authClient = createAuthClient({
  ...(getArtifactAuthBaseUrl() ? { baseURL: getArtifactAuthBaseUrl() } : {}),
  fetchOptions: {
    credentials: 'include',
    auth: {
      type: 'Bearer',
      token: () => readAuthBearerToken() ?? '',
    },
    onSuccess: (context) => {
      persistAuthBearerToken(context.response.headers.get('set-auth-token'));
    },
  },
});
