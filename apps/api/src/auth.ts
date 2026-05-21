import { createHmac, timingSafeEqual } from 'node:crypto';
import { verifyToken } from '@clerk/backend';
import type { AiAccessResponse, AiProvider, AiQuotaSnapshot } from './contracts.js';
import { logWarn } from './logger.js';

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

export interface JwtVerifierOptions {
  secret: string;
  issuer?: string;
  audience?: string;
  now?: () => Date;
}

export interface ClerkBearerVerifierOptions {
  secretKey?: string;
  jwtKey?: string;
  authorizedParties?: string[];
}

interface JwtClaims {
  sub?: unknown;
  id?: unknown;
  email?: unknown;
  role?: unknown;
  iss?: unknown;
  aud?: unknown;
  exp?: unknown;
  nbf?: unknown;
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

export function createJwtBearerVerifier(options: JwtVerifierOptions) {
  return async (token: string): Promise<RequestUser | null> => verifySignedBearerToken(token, options);
}

export function createClerkBearerVerifier(options: ClerkBearerVerifierOptions) {
  return async (token: string): Promise<RequestUser | null> => {
    if (!options.secretKey && !options.jwtKey) return null;
    const result = await verifyToken(token, {
      secretKey: options.secretKey,
      jwtKey: options.jwtKey,
      authorizedParties: options.authorizedParties?.filter(Boolean),
    });
    if (result.errors) {
      logWarn('auth.clerk_token_rejected', {
        reason: clerkErrorSummary(result.errors),
      });
      return null;
    }

    const payload = result.data;
    if (!payload || typeof payload !== 'object') return null;

    const claims = payload as Record<string, unknown>;
    const { sub, email, role } = claims;
    if (typeof sub !== 'string' || !sub) return null;
    return {
      id: sub,
      email: typeof email === 'string' ? email : undefined,
      role: typeof role === 'string' ? role : undefined,
    };
  };
}

export function verifySignedBearerToken(token: string, options: JwtVerifierOptions): RequestUser | null {
  const [encodedHeader, encodedPayload, signature] = token.split('.');
  if (!encodedHeader || !encodedPayload || !signature) return null;

  const header = parseJwtPart<{ alg?: unknown; typ?: unknown }>(encodedHeader);
  const claims = parseJwtPart<JwtClaims>(encodedPayload);
  if (!header || !claims || header.alg !== 'HS256') return null;

  const expectedSignature = signJwtParts(`${encodedHeader}.${encodedPayload}`, options.secret);
  if (!safeEqual(signature, expectedSignature)) return null;

  const nowSeconds = Math.floor((options.now?.() ?? new Date()).getTime() / 1000);
  if (typeof claims.exp === 'number' && claims.exp <= nowSeconds) return null;
  if (typeof claims.nbf === 'number' && claims.nbf > nowSeconds) return null;
  if (options.issuer && claims.iss !== options.issuer) return null;
  if (options.audience && !audienceMatches(claims.aud, options.audience)) return null;

  const id = typeof claims.sub === 'string' ? claims.sub : typeof claims.id === 'string' ? claims.id : undefined;
  if (!id) return null;

  return {
    id,
    email: typeof claims.email === 'string' ? claims.email : undefined,
    role: typeof claims.role === 'string' ? claims.role : undefined,
  };
}

export function computeAiAccessResponse(options: ComputeAiAccessOptions): AiAccessResponse {
  const { aiEnabled, auth, maintenance = false, providers = [], quota } = options;
  const quotaExhausted = quota ? quota.remaining <= 0 : false;
  const enabled = auth.authenticated && aiEnabled && !maintenance && !quotaExhausted;

  let disabledReason: AiAccessResponse['disabledReason'];
  if (!enabled) {
    if (maintenance) disabledReason = 'maintenance';
    else if (!auth.authenticated)
      disabledReason = auth.reason === 'invalid_credentials' ? 'invalid_session' : 'anonymous';
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

function parseJwtPart<T>(encoded: string): T | null {
  try {
    return JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as T;
  } catch {
    return null;
  }
}

function signJwtParts(value: string, secret: string): string {
  return createHmac('sha256', secret).update(value).digest('base64url');
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.byteLength === right.byteLength && timingSafeEqual(left, right);
}

function audienceMatches(claimAudience: unknown, expectedAudience: string) {
  if (typeof claimAudience === 'string') return claimAudience === expectedAudience;
  if (Array.isArray(claimAudience)) return claimAudience.includes(expectedAudience);
  return false;
}

function clerkErrorSummary(errors: unknown) {
  if (!Array.isArray(errors)) return 'unknown';
  return errors
    .map((error) => {
      if (!error || typeof error !== 'object') return 'unknown';
      const fields = error as Record<string, unknown>;
      return String(fields.code ?? fields.reason ?? fields.message ?? 'unknown');
    })
    .join(',');
}
