import { betterAuth } from 'better-auth';
import { bearer } from 'better-auth/plugins';
import type { Pool } from 'pg';
import type { ApiConfig } from './config.js';

export function createArtifactBetterAuth(config: ApiConfig, pool: Pool | null) {
  if (!pool) return null;

  return betterAuth({
    database: pool,
    secret: config.betterAuthSecret,
    ...(config.betterAuthUrl ? { baseURL: config.betterAuthUrl } : {}),
    trustedOrigins: [config.webOrigin],
    emailAndPassword: {
      enabled: true,
    },
    plugins: [bearer()],
  });
}

export type ArtifactBetterAuth = NonNullable<ReturnType<typeof createArtifactBetterAuth>>;
