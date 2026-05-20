import type { AiAccessResponse, AiProvider, AiQuotaSnapshot } from './contracts.js';

export interface RequestUser {
  id: string;
  email?: string;
  role?: string;
}

export type AuthFailureReason = 'missing_credentials' | 'invalid_credentials';

export type RequestUserResolution =
  | {
      authenticated: true;
      token?: string;
      user: RequestUser;
    }
  | {
      authenticated: false;
      reason: AuthFailureReason;
    };

export interface HeaderReadable {
  get(name: string): string | null;
}

export interface RequestLike {
  headers?: HeaderReadable | Record<string, string | string[] | undefined>;
}

export type MaybePromise<T> = T | Promise<T>;

export interface ResolveRequestUserOptions {
  devUser?: RequestUser;
  verifyBearerToken?: (token: string) => MaybePromise<RequestUser | null>;
}

export interface ComputeAiAccessOptions {
  aiEnabled: boolean;
  auth: RequestUserResolution;
  maintenance?: boolean;
  providers?: AiProvider[];
  quota?: AiQuotaSnapshot;
}

function readHeader(request: RequestLike, name: string): string | undefined {
  const { headers } = request;
  if (!headers) return undefined;

  if ('get' in headers && typeof headers.get === 'function') {
    return headers.get(name) ?? undefined;
  }

  const lowerName = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== lowerName) continue;
    return Array.isArray(value) ? value[0] : value;
  }

  return undefined;
}

export function readBearerToken(request: RequestLike): string | undefined {
  const authorization = readHeader(request, 'authorization');
  if (!authorization) return undefined;

  const [scheme, ...tokenParts] = authorization.trim().split(/\s+/);
  if (scheme?.toLowerCase() !== 'bearer') return undefined;

  const token = tokenParts.join(' ').trim();
  return token || undefined;
}

export async function resolveRequestUser(
  request: RequestLike,
  options: ResolveRequestUserOptions = {},
): Promise<RequestUserResolution> {
  const token = readBearerToken(request);
  if (!token) {
    return options.devUser
      ? { authenticated: true, user: options.devUser }
      : { authenticated: false, reason: 'missing_credentials' };
  }

  const user = await options.verifyBearerToken?.(token);
  if (!user) {
    return { authenticated: false, reason: 'invalid_credentials' };
  }

  return { authenticated: true, token, user };
}

export function computeAiAccessResponse(options: ComputeAiAccessOptions): AiAccessResponse {
  const { aiEnabled, auth, maintenance = false, providers = [], quota } = options;
  const quotaExhausted = quota ? quota.remaining <= 0 : false;
  const enabled = auth.authenticated && aiEnabled && !maintenance && !quotaExhausted;

  let disabledReason: AiAccessResponse['disabledReason'];
  if (!enabled) {
    if (maintenance) disabledReason = 'maintenance';
    else if (!auth.authenticated) disabledReason = 'anonymous';
    else if (!aiEnabled) disabledReason = 'not_enabled';
    else if (quotaExhausted) disabledReason = 'quota_exhausted';
  }

  return {
    authenticated: auth.authenticated,
    enabled,
    disabledReason,
    providers,
    quota,
    user: auth.authenticated ? auth.user : undefined,
  };
}
