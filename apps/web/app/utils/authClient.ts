import { createAuthClient } from 'better-auth/react';
import { getArtifactAuthApiBaseUrl } from './apiBaseUrl';

export const AUTH_BEARER_TOKEN_KEY = 'artifact-better-auth-token';

interface BetterAuthClientResult {
  data?: unknown;
  error?: {
    code?: string;
    message?: string;
    status?: number;
  } | null;
}

interface PasswordRecoveryClient {
  requestPasswordReset: (input: { email: string; redirectTo: string }) => Promise<BetterAuthClientResult>;
  resetPassword: (input: { newPassword: string; token: string }) => Promise<BetterAuthClientResult>;
}

export function getArtifactAuthBaseUrl() {
  return getArtifactAuthApiBaseUrl();
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

function passwordRecoveryClient() {
  return authClient as unknown as PasswordRecoveryClient;
}

export async function requestArtifactPasswordReset(input: { email: string; redirectTo: string }) {
  return passwordRecoveryClient().requestPasswordReset(input);
}

export async function resetArtifactPassword(input: { newPassword: string; token: string }) {
  return passwordRecoveryClient().resetPassword(input);
}
