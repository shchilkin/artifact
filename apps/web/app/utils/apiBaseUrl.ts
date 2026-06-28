const PRODUCTION_API_BASE_URL = 'https://api.artifact.shchilkin.dev';
const PRODUCTION_WEB_HOSTS = new Set(['artifact.shchilkin.dev']);

export interface ArtifactClientEnv {
  PROD?: boolean;
  VITE_AI_API_BASE_URL?: string;
  VITE_AUTH_API_BASE_URL?: string;
}

export interface ArtifactLocationLike {
  hostname?: string;
}

function env() {
  return (import.meta as unknown as { env?: ArtifactClientEnv }).env ?? {};
}

function currentLocation(): ArtifactLocationLike | undefined {
  return typeof window === 'undefined' ? undefined : window.location;
}

export function getArtifactAiApiBaseUrl() {
  return resolveArtifactApiBaseUrl(env().VITE_AI_API_BASE_URL, env(), currentLocation());
}

export function getArtifactAuthApiBaseUrl() {
  return resolveArtifactApiBaseUrl(env().VITE_AUTH_API_BASE_URL, env(), currentLocation());
}

export function resolveArtifactApiBaseUrl(
  configuredValue: string | undefined,
  clientEnv: ArtifactClientEnv,
  location: ArtifactLocationLike | undefined,
) {
  const configured = normalizeBaseUrl(configuredValue);
  if (!clientEnv.PROD) return configured;
  if (configured && !isLocalApiBaseUrl(configured)) return configured;
  if (isProductionWebHost(location?.hostname)) return PRODUCTION_API_BASE_URL;
  return undefined;
}

function normalizeBaseUrl(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed.replace(/\/$/, '') : undefined;
}

function isProductionWebHost(hostname: string | undefined) {
  return Boolean(hostname && PRODUCTION_WEB_HOSTS.has(hostname));
}

function isLocalApiBaseUrl(value: string) {
  try {
    const hostname = new URL(value).hostname;
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  } catch {
    return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::|\/|$)/i.test(value);
  }
}
