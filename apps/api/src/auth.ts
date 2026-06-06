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
  azp?: unknown;
  sid?: unknown;
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
    const payload = await verifyClerkToken(token, options);
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

async function verifyClerkToken(token: string, options: ClerkBearerVerifierOptions) {
  try {
    return await verifyToken(token, {
      secretKey: options.secretKey,
      jwtKey: options.jwtKey,
      authorizedParties: options.authorizedParties?.filter(Boolean),
    });
  } catch (error) {
    logWarn('auth.clerk_token_rejected', {
      reason: error instanceof Error ? error.message : 'unknown',
      authorizedParties: formatAuthorizedParties(options.authorizedParties),
      ...summarizeBearerTokenClaims(token),
    });
    return null;
  }
}

export function verifySignedBearerToken(token: string, options: JwtVerifierOptions): RequestUser | null {
  const decoded = decodeSignedJwt(token);
  if (!decoded) return null;
  if (!jwtSignatureValid(decoded, options.secret)) return null;
  if (!jwtClaimsValid(decoded.claims, options)) return null;

  const id = requestUserIdFromClaims(decoded.claims);
  if (!id) return null;
  return {
    id,
    email: stringClaim(decoded.claims.email),
    role: stringClaim(decoded.claims.role),
  };
}

function decodeSignedJwt(token: string) {
  const [encodedHeader, encodedPayload, signature] = token.split('.');
  if (!encodedHeader || !encodedPayload || !signature) return null;

  const header = parseJwtPart<{ alg?: unknown; typ?: unknown }>(encodedHeader);
  const claims = parseJwtPart<JwtClaims>(encodedPayload);
  if (!header || !claims || header.alg !== 'HS256') return null;
  return { encodedHeader, encodedPayload, signature, claims };
}

function jwtSignatureValid(decoded: NonNullable<ReturnType<typeof decodeSignedJwt>>, secret: string) {
  const expectedSignature = signJwtParts(`${decoded.encodedHeader}.${decoded.encodedPayload}`, secret);
  return safeEqual(decoded.signature, expectedSignature);
}

function jwtClaimsValid(claims: JwtClaims, options: JwtVerifierOptions) {
  return (
    jwtTimeClaimsValid(claims, options.now?.() ?? new Date()) &&
    jwtIssuerValid(claims, options.issuer) &&
    jwtAudienceValid(claims, options.audience)
  );
}

function jwtTimeClaimsValid(claims: JwtClaims, now: Date) {
  const nowSeconds = Math.floor(now.getTime() / 1000);
  if (typeof claims.exp === 'number' && claims.exp <= nowSeconds) return false;
  if (typeof claims.nbf === 'number' && claims.nbf > nowSeconds) return false;
  return true;
}

function jwtIssuerValid(claims: JwtClaims, issuer: string | undefined) {
  return !issuer || claims.iss === issuer;
}

function jwtAudienceValid(claims: JwtClaims, audience: string | undefined) {
  return !audience || audienceMatches(claims.aud, audience);
}

function requestUserIdFromClaims(claims: JwtClaims) {
  return stringClaim(claims.sub) ?? stringClaim(claims.id);
}

function stringClaim(value: unknown) {
  return typeof value === 'string' ? value : undefined;
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

function summarizeBearerTokenClaims(token: string) {
  const [, encodedPayload] = token.split('.');
  const claims = encodedPayload ? parseJwtPart<JwtClaims>(encodedPayload) : null;
  if (!claims) {
    return {
      tokenClaims: 'unavailable',
    };
  }

  return {
    tokenClaims: 'decoded',
    tokenSub: debugClaim(claims.sub),
    tokenIss: debugClaim(claims.iss),
    tokenAud: debugClaim(claims.aud),
    tokenAzp: debugClaim(claims.azp),
    tokenSid: debugClaim(claims.sid),
  };
}

function debugClaim(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(debugClaim).filter(Boolean).join(',');
  return null;
}

function formatAuthorizedParties(parties: string[] | undefined) {
  const filtered = parties?.filter(Boolean) ?? [];
  return filtered.length ? filtered.join(',') : null;
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
