import { betterAuth } from 'better-auth';
import { bearer } from 'better-auth/plugins';
import type { Pool } from 'pg';
import type { ApiConfig } from './config.js';
import { isAllowedWebOrigin } from './http.js';

export function createArtifactBetterAuth(config: ApiConfig, pool: Pool | null) {
  if (!pool) return null;

  return betterAuth({
    database: pool,
    secret: config.betterAuthSecret,
    ...(config.betterAuthUrl ? { baseURL: config.betterAuthUrl } : {}),
    trustedOrigins: createTrustedOriginsResolver(config.webOrigins),
    emailAndPassword: {
      enabled: true,
    },
    plugins: [bearer()],
  });
}

export function createTrustedOriginsResolver(webOrigins: readonly string[]) {
  return (request?: Request) => {
    const requestOrigin = request ? requestOriginHeader(request) : null;
    if (!requestOrigin) return exactOrigins(webOrigins);
    return isAllowedWebOrigin(requestOrigin, webOrigins) ? [normalizeOriginValue(requestOrigin)] : [];
  };
}

function exactOrigins(webOrigins: readonly string[]) {
  return webOrigins.filter((origin) => !origin.includes('*') && !origin.includes('?'));
}

function requestOriginHeader(request: Request) {
  return request.headers.get('origin') ?? request.headers.get('referer');
}

function normalizeOriginValue(value: string) {
  const trimmed = value.trim().replace(/\/$/, '');
  try {
    const url = new URL(trimmed);
    if (url.protocol === 'http:' || url.protocol === 'https:') return url.origin;
  } catch {
    // Keep the original value so the allow-list check can reject it.
  }
  return trimmed;
}

export type ArtifactBetterAuth = NonNullable<ReturnType<typeof createArtifactBetterAuth>>;
