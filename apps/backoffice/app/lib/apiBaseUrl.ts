const PRODUCTION_API_BASE_URL = 'https://api.artifact.shchilkin.dev';

export interface BackofficeClientEnv {
  PROD?: boolean;
  VITE_BACKOFFICE_API_BASE_URL?: string;
}

export function getBackofficeApiBaseUrl() {
  const clientEnv = (import.meta as unknown as { env?: BackofficeClientEnv }).env ?? {};
  return resolveBackofficeApiBaseUrl(clientEnv.VITE_BACKOFFICE_API_BASE_URL, clientEnv);
}

export function resolveBackofficeApiBaseUrl(configuredValue: string | undefined, clientEnv: BackofficeClientEnv) {
  const configured = configuredValue?.trim().replace(/\/$/, '');
  if (configured) return configured;
  return clientEnv.PROD ? PRODUCTION_API_BASE_URL : 'http://127.0.0.1:4000';
}
