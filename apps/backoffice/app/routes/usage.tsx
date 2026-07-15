import type {
  AdminAiOperationReconciliationResponse,
  AdminProviderReconciliation,
  AdminUsageEvent,
} from '@artifact/shared';
import { useState } from 'react';
import { Form, Link, useFetcher, useLocation } from 'react-router';
import { AdminRouteError } from '../components/RouteState';
import {
  ControlSection,
  DataTable,
  Metric,
  MutationNotice,
  PageHeader,
  Pagination,
  StatusBadge,
} from '../components/Ui';
import { AdminApiError, adminApi } from '../lib/adminApi';
import { formatFeature, formatInteger, formatMicroUsd, formatTimestamp } from '../lib/format';
import { emptyTableState } from '../lib/tableState';
import type { Route } from './+types/usage';

const usageColumns = [
  { key: 'time', label: 'Time' },
  { key: 'account', label: 'Account' },
  { key: 'feature', label: 'Feature' },
  { key: 'provider', label: 'Provider / model' },
  { key: 'status', label: 'Status' },
  { key: 'tokens', label: 'Tokens' },
  { key: 'cost', label: 'Cost' },
  { key: 'request', label: 'Request' },
] as const;

const reconciliationColumns = [
  { key: 'date', label: 'Usage date' },
  { key: 'provider', label: 'Provider' },
  { key: 'status', label: 'Status' },
  { key: 'provider-cost', label: 'Provider cost' },
  { key: 'internal-cost', label: 'Internal cost' },
  { key: 'difference', label: 'Difference' },
  { key: 'synced', label: 'Synced' },
] as const;

interface OperationRecoveryMutationResult {
  ok: boolean;
  message: string;
  code?: string;
}

export async function clientLoader({ request }: Route.ClientLoaderArgs) {
  const url = new URL(request.url);
  const filters = {
    userId: url.searchParams.get('userId') || undefined,
    provider: url.searchParams.get('provider') || undefined,
    status: url.searchParams.get('status') || undefined,
    limit: readPageValue(url.searchParams.get('limit'), 25),
    offset: readPageValue(url.searchParams.get('offset'), 0),
  };
  const [usage, reconciliations, operationReconciliation] = await Promise.all([
    adminApi.usage(filters, request.signal),
    adminApi.reconciliations(30, request.signal),
    adminApi.operationReconciliation(request.signal),
  ]);
  return { usage, reconciliations, operationReconciliation };
}

export async function clientAction({ request }: Route.ClientActionArgs): Promise<OperationRecoveryMutationResult> {
  const form = await request.formData();
  const reason = formText(form, 'reason').trim();
  const idempotencyKey = formText(form, 'idempotencyKey').trim();
  if (!reason || !idempotencyKey) {
    return { ok: false, code: 'invalid_request', message: 'Add a reason before running recovery.' };
  }
  try {
    const result = await adminApi.reconcileOperations({ reason, idempotencyKey });
    return { ok: true, message: operationRecoveryMessage(result) };
  } catch (error) {
    if (error instanceof AdminApiError) return { ok: false, code: error.code, message: error.message };
    throw error;
  }
}

export default function UsageRoute({ loaderData }: Route.ComponentProps) {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const summary = summarizeUsage(loaderData.usage.usage);
  return (
    <div className="page">
      <PageHeader
        eyebrow="Operations / provider usage"
        title="Provider ledger"
        summary="Metadata-only call history and daily reconciliation. Prompts, shader code, assets, and projects are not available here."
      />
      <Form className="filter-bar usage-filters" method="get">
        <label className="search-field">
          <span>Account ID</span>
          <input defaultValue={params.get('userId') ?? ''} name="userId" placeholder="All accounts" />
        </label>
        <label>
          <span>Provider</span>
          <input defaultValue={params.get('provider') ?? ''} name="provider" placeholder="All providers" />
        </label>
        <label>
          <span>Status</span>
          <select defaultValue={params.get('status') ?? ''} name="status">
            <option value="">All statuses</option>
            <option value="succeeded">Succeeded</option>
            <option value="failed">Failed</option>
          </select>
        </label>
        <button className="primary-button" type="submit">
          Apply
        </button>
      </Form>

      <section className="metric-strip compact-metrics" aria-label="Visible usage totals">
        <Metric
          label="Visible calls"
          value={formatInteger(loaderData.usage.usage.length)}
          detail={`${loaderData.usage.page.total} matching`}
        />
        <Metric label="Visible spend" value={formatMicroUsd(String(summary.totalCost))} detail="current page" />
        <Metric label="Failures" value={String(summary.failed)} detail="current page" />
      </section>

      <OperationRecovery reconciliation={loaderData.operationReconciliation} />

      <section className="table-section" aria-labelledby="usage-table-title">
        <div className="section-heading compact">
          <div>
            <p className="eyebrow">Usage events</p>
            <h2 id="usage-table-title">Provider calls</h2>
          </div>
        </div>
        <DataTable
          columns={usageColumns}
          empty={emptyTableState(
            loaderData.usage.usage.length,
            'No usage events',
            'No provider calls match the current filters.',
          )}
        >
          {loaderData.usage.usage.map((event) => (
            <UsageRow event={event} key={event.id} />
          ))}
        </DataTable>
        <Pagination {...loaderData.usage.page} />
      </section>

      <section className="table-section" aria-labelledby="reconciliation-title">
        <div className="section-heading compact">
          <div>
            <p className="eyebrow">Daily checks</p>
            <h2 id="reconciliation-title">Reconciliation</h2>
          </div>
        </div>
        <DataTable
          columns={reconciliationColumns}
          empty={emptyTableState(
            loaderData.reconciliations.reconciliations.length,
            'No reconciliation runs',
            'Daily provider checks have not produced a record yet.',
          )}
        >
          {loaderData.reconciliations.reconciliations.map((row) => (
            <ReconciliationRow key={row.id} row={row} />
          ))}
        </DataTable>
      </section>
    </div>
  );
}

function OperationRecovery({ reconciliation }: { reconciliation: AdminAiOperationReconciliationResponse }) {
  const fetcher = useFetcher<typeof clientAction>();
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const pending = fetcher.state !== 'idle';
  return (
    <ControlSection
      eyebrow="AI operations"
      title="Operation recovery"
      copy="Finalize completed AI results that were not recorded and close abandoned requests older than six hours."
      badge={reconciliation.nextAllowedAt ? <StatusBadge value="recently checked" /> : undefined}
    >
      <dl className="operation-recovery-summary" aria-label="Operation recovery preview">
        <div>
          <dt>Ready to finalize</dt>
          <dd>{formatInteger(reconciliation.recoveredOperationIds.length)}</dd>
        </div>
        <div>
          <dt>Ready to close</dt>
          <dd>{formatInteger(reconciliation.expiredOperationIds.length)}</dd>
        </div>
        <div>
          <dt>Checked</dt>
          <dd>{formatTimestamp(reconciliation.checkedAt)}</dd>
        </div>
      </dl>
      <fetcher.Form method="post" onSubmit={() => setIdempotencyKey(crypto.randomUUID())}>
        <input name="idempotencyKey" type="hidden" value={idempotencyKey} />
        <label>
          <span>Reason</span>
          <textarea name="reason" placeholder="Why is manual recovery needed?" required disabled={pending} />
        </label>
        <button className="primary-button" type="submit" disabled={pending}>
          {pending ? 'Recovering...' : 'Recover operations'}
        </button>
      </fetcher.Form>
      <MutationNotice result={fetcher.data} />
    </ControlSection>
  );
}

function operationRecoveryMessage(result: AdminAiOperationReconciliationResponse) {
  if (result.repeated) return 'This recovery request was already applied.';
  const recovered = result.recoveredOperationIds.length;
  const expired = result.expiredOperationIds.length;
  if (recovered === 0 && expired === 0) return 'No unfinished operations needed recovery.';
  return `Finalized ${recovered} completed ${pluralize(recovered, 'result')} and closed ${expired} abandoned ${pluralize(expired, 'request')}.`;
}

function pluralize(count: number, singular: string) {
  return count === 1 ? singular : `${singular}s`;
}

function formText(form: FormData, name: string) {
  const value = form.get(name);
  return typeof value === 'string' ? value : '';
}

function numericMetric(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function summarizeUsage(events: readonly AdminUsageEvent[]) {
  let totalCost = 0;
  let failed = 0;
  for (const event of events) {
    totalCost += Number(event.costMicroUsd);
    if (event.status === 'failed') failed += 1;
  }
  return { totalCost, failed };
}

function UsageRow({ event }: { event: AdminUsageEvent }) {
  const inputTokens = numericMetric(event.usage.inputTokens);
  const outputTokens = numericMetric(event.usage.outputTokens);
  return (
    <tr>
      <td>{formatTimestamp(event.createdAt)}</td>
      <td>
        <Link className="table-link" to={`/accounts/${encodeURIComponent(event.userId)}`}>
          {event.userId}
        </Link>
      </td>
      <td>{formatFeature(event.feature)}</td>
      <td>
        <strong>{event.provider}</strong>
        <small>{event.model}</small>
      </td>
      <td>
        <StatusBadge value={event.status} />
      </td>
      <td>
        {formatInteger(inputTokens + outputTokens)}
        <small>
          {formatInteger(inputTokens)} in / {formatInteger(outputTokens)} out
        </small>
      </td>
      <td>{formatMicroUsd(event.costMicroUsd)}</td>
      <td>
        <code>{event.providerRequestId ?? 'not reported'}</code>
      </td>
    </tr>
  );
}

function ReconciliationRow({ row }: { row: AdminProviderReconciliation }) {
  const difference = Number(row.providerCostMicroUsd ?? 0) - Number(row.internalCostMicroUsd);
  return (
    <tr>
      <td>{row.usageDate}</td>
      <td>{row.provider}</td>
      <td>
        <StatusBadge value={row.status} />
      </td>
      <td>{providerCostText(row.providerCostMicroUsd)}</td>
      <td>{formatMicroUsd(row.internalCostMicroUsd)}</td>
      <td className={differenceClassName(difference)}>{differenceText(row.providerCostMicroUsd, difference)}</td>
      <td>{formatTimestamp(row.syncedAt)}</td>
    </tr>
  );
}

function providerCostText(cost: string | null) {
  if (cost === null) return 'Pending';
  return formatMicroUsd(cost);
}

function differenceText(providerCost: string | null, difference: number) {
  if (providerCost === null) return 'Pending';
  return formatMicroUsd(String(difference));
}

function differenceClassName(difference: number) {
  return difference === 0 ? '' : 'warning-text';
}

function readPageValue(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

export const ErrorBoundary = AdminRouteError;
