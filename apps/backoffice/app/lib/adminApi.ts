import {
  ADMIN_API_PATHS,
  type AdminAccountDetailResponse,
  type AdminAccountMutationResponse,
  type AdminAccountsResponse,
  type AdminAssignTierRequest,
  type AdminOverviewResponse,
  type AdminQuotaGrantRequest,
  type AdminQuotaGrantReversalRequest,
  type AdminReconciliationsResponse,
  type AdminUsageResponse,
} from '@artifact/shared';
import { getBackofficeApiBaseUrl } from './apiBaseUrl';
import { readAuthBearerToken } from './authToken';

export class AdminApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AdminApiError';
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
  signal?: AbortSignal;
}

async function requestJson<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const token = readAuthBearerToken();
  const response = await fetch(`${getBackofficeApiBaseUrl()}${path}`, {
    method: options.method ?? 'GET',
    credentials: 'include',
    signal: options.signal,
    headers: {
      accept: 'application/json',
      ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });

  const payload = await readPayload(response);
  if (!response.ok) {
    const error = payload as { code?: unknown; message?: unknown };
    throw new AdminApiError(
      response.status,
      typeof error.code === 'string' ? error.code : 'admin_request_failed',
      typeof error.message === 'string' ? error.message : 'The request could not be completed.',
    );
  }
  return payload as T;
}

async function readPayload(response: Response) {
  try {
    return (await response.json()) as unknown;
  } catch {
    throw new AdminApiError(
      response.status || 500,
      'admin_invalid_response',
      'The service returned an unreadable response.',
    );
  }
}

function withQuery(path: string, values: Record<string, string | number | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

export const adminApi = {
  overview(period: string, signal?: AbortSignal) {
    return requestJson<AdminOverviewResponse>(withQuery(ADMIN_API_PATHS.overview, { period }), { signal });
  },
  accounts(input: { period: string; q?: string; limit?: number; offset?: number }, signal?: AbortSignal) {
    return requestJson<AdminAccountsResponse>(withQuery(ADMIN_API_PATHS.accounts, input), { signal });
  },
  account(userId: string, period: string, signal?: AbortSignal) {
    return requestJson<AdminAccountDetailResponse>(withQuery(ADMIN_API_PATHS.account(userId), { period }), { signal });
  },
  usage(
    input: {
      userId?: string;
      provider?: string;
      status?: string;
      limit?: number;
      offset?: number;
    },
    signal?: AbortSignal,
  ) {
    return requestJson<AdminUsageResponse>(withQuery(ADMIN_API_PATHS.usage, input), { signal });
  },
  reconciliations(limit = 30, signal?: AbortSignal) {
    return requestJson<AdminReconciliationsResponse>(withQuery(ADMIN_API_PATHS.reconciliations, { limit }), { signal });
  },
  assignTier(userId: string, input: AdminAssignTierRequest) {
    return requestJson<AdminAccountMutationResponse>(ADMIN_API_PATHS.accountTier(userId), {
      method: 'POST',
      body: input,
    });
  },
  grantQuota(userId: string, input: AdminQuotaGrantRequest) {
    return requestJson<AdminAccountMutationResponse>(ADMIN_API_PATHS.accountQuotaGrants(userId), {
      method: 'POST',
      body: input,
    });
  },
  reverseQuota(grantId: string, input: AdminQuotaGrantReversalRequest) {
    return requestJson<AdminAccountMutationResponse>(ADMIN_API_PATHS.quotaGrantReversals(grantId), {
      method: 'POST',
      body: input,
    });
  },
};

export function currentUtcPeriod(date = new Date()) {
  return date.toISOString().slice(0, 7);
}

export function readPositiveInteger(value: FormDataEntryValue | null) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}
