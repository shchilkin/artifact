const AUTH_BEARER_TOKEN_KEY = 'artifact-better-auth-token';

export function readAuthBearerToken() {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(AUTH_BEARER_TOKEN_KEY);
}

export function persistAuthBearerToken(token: string | null) {
  if (typeof window === 'undefined' || !token) return;
  window.localStorage.setItem(AUTH_BEARER_TOKEN_KEY, token);
}

export function clearAuthBearerToken() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(AUTH_BEARER_TOKEN_KEY);
}
