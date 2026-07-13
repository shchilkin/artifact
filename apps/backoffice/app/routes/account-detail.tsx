import type { AccountTier, AdminAccountDetailResponse, AdminAuditEvent, AdminQuotaGrant } from '@artifact/shared';
import { useState } from 'react';
import { Link, useFetcher, useLocation } from 'react-router';
import { AccountRouteError } from '../components/RouteState';
import { ControlSection, DataTable, Metric, MutationNotice, PageHeader, StatusBadge } from '../components/Ui';
import { AdminApiError, adminApi, currentUtcPeriod, readPositiveInteger } from '../lib/adminApi';
import { formatMicroUsd, formatTimestamp } from '../lib/format';
import { emptyTableState } from '../lib/tableState';
import type { Route } from './+types/account-detail';

interface MutationResult {
  ok: boolean;
  message: string;
  code?: string;
}

interface MutationMetadata {
  idempotencyKey: string;
  reason: string;
}

type MutationHandler = (userId: string, form: FormData, metadata: MutationMetadata) => Promise<MutationResult>;

const mutationHandlers: Record<string, MutationHandler> = {
  'assign-tier': assignTier,
  'grant-quota': grantQuota,
  'reverse-quota': reverseQuota,
};

const quotaColumns = [
  { key: 'period', label: 'Period' },
  { key: 'granted', label: 'Granted' },
  { key: 'reversed', label: 'Reversed' },
  { key: 'remaining', label: 'Remaining' },
  { key: 'reason', label: 'Reason' },
  { key: 'created', label: 'Created' },
  { key: 'correction', label: 'Correction' },
] as const;

const auditColumns = [
  { key: 'action', label: 'Action' },
  { key: 'reason', label: 'Reason' },
  { key: 'admin', label: 'Admin' },
  { key: 'entity', label: 'Entity' },
  { key: 'created', label: 'Created' },
] as const;

export async function clientLoader({ params, request }: Route.ClientLoaderArgs) {
  const period = new URL(request.url).searchParams.get('period') || currentUtcPeriod();
  return adminApi.account(params.userId, period, request.signal);
}

export async function clientAction({ params, request }: Route.ClientActionArgs): Promise<MutationResult> {
  const form = await request.formData();
  const intent = formText(form, 'intent');
  const metadata = readMutationMetadata(form);
  if (!metadata) return invalidMutation('Add a reason before saving.');
  const handler = mutationHandlers[intent];
  if (!handler) return invalidMutation('Unknown account change.');

  try {
    return await handler(params.userId, form, metadata);
  } catch (error) {
    return mutationError(error);
  }
}

async function assignTier(userId: string, form: FormData, metadata: MutationMetadata): Promise<MutationResult> {
  const tier = formText(form, 'tier') as AccountTier;
  await adminApi.assignTier(userId, {
    tier,
    expectedTier: formText(form, 'expectedTier') as AccountTier,
    expectedVersion: Number(form.get('expectedVersion')),
    ...metadata,
  });
  return { ok: true, message: `Tier changed to ${tier}.` };
}

async function grantQuota(userId: string, form: FormData, metadata: MutationMetadata): Promise<MutationResult> {
  const amount = readPositiveInteger(form.get('amount'));
  const period = formText(form, 'period');
  if (amount === null || !/^\d{4}-\d{2}$/.test(period)) {
    return invalidMutation('Enter a positive amount and a valid UTC month.');
  }
  await adminApi.grantQuota(userId, { amount, period, ...metadata });
  return { ok: true, message: `${amount} generations added for ${period}.` };
}

async function reverseQuota(_userId: string, form: FormData, metadata: MutationMetadata): Promise<MutationResult> {
  const amount = readPositiveInteger(form.get('amount'));
  const grantId = formText(form, 'grantId');
  if (amount === null || !grantId) return invalidMutation('Enter a valid reversal amount.');
  await adminApi.reverseQuota(grantId, { amount, ...metadata });
  return { ok: true, message: `${amount} granted generations reversed.` };
}

function readMutationMetadata(form: FormData): MutationMetadata | null {
  const reason = formText(form, 'reason').trim();
  const idempotencyKey = formText(form, 'idempotencyKey').trim();
  if (!reason) return null;
  if (!idempotencyKey) return null;
  return { reason, idempotencyKey };
}

function invalidMutation(message: string): MutationResult {
  return { ok: false, code: 'invalid_request', message };
}

function mutationError(error: unknown): MutationResult {
  if (error instanceof AdminApiError) return { ok: false, code: error.code, message: error.message };
  throw error;
}

function formText(form: FormData, name: string) {
  const value = form.get(name);
  return typeof value === 'string' ? value : '';
}

export default function AccountDetailRoute({ loaderData }: Route.ComponentProps) {
  const account = loaderData.account;
  const location = useLocation();
  const period = new URLSearchParams(location.search).get('period') || currentUtcPeriod();
  const netGrant = loaderData.quotaGrants.reduce((total, grant) => total + grant.amount - grant.reversedAmount, 0);
  return (
    <div className="page">
      <Link className="back-link" to={`/accounts?period=${period}`}>
        Back to accounts
      </Link>
      <PageHeader
        eyebrow="Operations / account detail"
        title={account.email ?? 'Account without email'}
        summary={`Account ID ${account.id}`}
        actions={<StatusBadge value={account.tier} />}
      />

      <section className="metric-strip account-metrics" aria-label="Account totals">
        <Metric label="Tier version" value={String(account.tierVersion)} detail={`role: ${account.role}`} />
        <Metric
          label="Generations"
          value={String(account.generations.committed)}
          detail={`${account.generations.reserved} reserved`}
        />
        <Metric label="Extra allowance" value={String(netGrant)} detail={period} />
        <Metric
          label="Provider spend"
          value={formatMicroUsd(account.providerCostMicroUsd)}
          detail={`${account.failedCalls} failed calls`}
        />
      </section>

      <div className="account-control-grid">
        <TierControl account={loaderData} />
        <GrantControl period={period} />
      </div>

      <section className="table-section" aria-labelledby="quota-ledger-title">
        <div className="section-heading compact">
          <div>
            <p className="eyebrow">Allowance ledger</p>
            <h2 id="quota-ledger-title">Quota grants</h2>
          </div>
        </div>
        <DataTable
          columns={quotaColumns}
          empty={emptyTableState(
            loaderData.quotaGrants.length,
            'No quota grants',
            'This account only uses its tier allowance.',
          )}
        >
          {loaderData.quotaGrants.map((grant) => (
            <QuotaGrantRow grant={grant} key={grant.id} />
          ))}
        </DataTable>
      </section>

      <section className="table-section" aria-labelledby="audit-title">
        <div className="section-heading compact">
          <div>
            <p className="eyebrow">Immutable history</p>
            <h2 id="audit-title">Admin changes</h2>
          </div>
        </div>
        <DataTable
          columns={auditColumns}
          empty={emptyTableState(
            loaderData.audit.length,
            'No admin changes',
            'Tier and quota changes will appear here with their reason.',
          )}
        >
          {loaderData.audit.map((event) => (
            <AuditEventRow event={event} key={event.id} />
          ))}
        </DataTable>
      </section>
    </div>
  );
}

function QuotaGrantRow({ grant }: { grant: AdminQuotaGrant }) {
  const remaining = grant.amount - grant.reversedAmount;
  return (
    <tr>
      <td>{grant.period}</td>
      <td>{grant.amount}</td>
      <td>{grant.reversedAmount}</td>
      <td>{remaining}</td>
      <td>{grant.reason}</td>
      <td>{formatTimestamp(grant.createdAt)}</td>
      <td>
        {remaining > 0 ? (
          <ReversalControl grantId={grant.id} maximum={remaining} />
        ) : (
          <span className="muted">Fully reversed</span>
        )}
      </td>
    </tr>
  );
}

function AuditEventRow({ event }: { event: AdminAuditEvent }) {
  return (
    <tr>
      <td>
        <StatusBadge value={event.action} />
      </td>
      <td>{event.reason}</td>
      <td>
        <code>{event.adminUserId}</code>
      </td>
      <td>
        {event.entityType}
        <small>{event.entityId}</small>
      </td>
      <td>{formatTimestamp(event.createdAt)}</td>
    </tr>
  );
}

function TierControl({ account }: { account: AdminAccountDetailResponse }) {
  const fetcher = useFetcher<typeof clientAction>();
  const [key, setKey] = useState(() => crypto.randomUUID());
  const pending = fetcher.state !== 'idle';
  return (
    <ControlSection
      eyebrow="Account tier"
      title="Change access"
      copy="Changes apply immediately and do not reset current usage."
      badge={<StatusBadge value={account.account.tier} />}
    >
      <fetcher.Form method="post" onSubmit={() => setKey(crypto.randomUUID())}>
        <input name="intent" type="hidden" value="assign-tier" />
        <input name="expectedTier" type="hidden" value={account.account.tier} />
        <input name="expectedVersion" type="hidden" value={account.account.tierVersion} />
        <input name="idempotencyKey" type="hidden" value={key} />
        <label>
          <span>New tier</span>
          <select defaultValue={account.account.tier} name="tier">
            <option value="free">Free</option>
            <option value="creator">Creator</option>
            <option value="founder">Founder</option>
          </select>
        </label>
        <label>
          <span>Reason for tier change</span>
          <textarea name="reason" placeholder="Why is access changing?" required rows={3} />
        </label>
        <button className="primary-button" disabled={pending} type="submit">
          {pending ? 'Saving' : 'Change tier'}
        </button>
      </fetcher.Form>
      <MutationNotice result={fetcher.data} />
    </ControlSection>
  );
}

function GrantControl({ period }: { period: string }) {
  const fetcher = useFetcher<typeof clientAction>();
  const [key, setKey] = useState(() => crypto.randomUUID());
  const pending = fetcher.state !== 'idle';
  return (
    <ControlSection
      eyebrow="Monthly allowance"
      title="Add quota"
      copy="Adds generations for one UTC month. Corrections are recorded as reversals."
    >
      <fetcher.Form method="post" onSubmit={() => setKey(crypto.randomUUID())}>
        <input name="intent" type="hidden" value="grant-quota" />
        <input name="idempotencyKey" type="hidden" value={key} />
        <div className="paired-fields">
          <label>
            <span>Period</span>
            <input defaultValue={period} name="period" required type="month" />
          </label>
          <label>
            <span>Generations</span>
            <input min="1" name="amount" required type="number" />
          </label>
        </div>
        <label>
          <span>Reason for quota grant</span>
          <textarea name="reason" placeholder="Why is this allowance needed?" required rows={3} />
        </label>
        <button className="primary-button" disabled={pending} type="submit">
          {pending ? 'Saving' : 'Add quota'}
        </button>
      </fetcher.Form>
      <MutationNotice result={fetcher.data} />
    </ControlSection>
  );
}

function ReversalControl({ grantId, maximum }: { grantId: string; maximum: number }) {
  const fetcher = useFetcher<typeof clientAction>();
  const [key, setKey] = useState(() => crypto.randomUUID());
  return (
    <fetcher.Form className="reversal-form" method="post" onSubmit={() => setKey(crypto.randomUUID())}>
      <input name="intent" type="hidden" value="reverse-quota" />
      <input name="grantId" type="hidden" value={grantId} />
      <input name="idempotencyKey" type="hidden" value={key} />
      <input
        aria-label="Amount to reverse"
        max={maximum}
        min="1"
        name="amount"
        placeholder="Amount"
        required
        type="number"
      />
      <input aria-label="Reversal reason" name="reason" placeholder="Reason" required />
      <button className="quiet-button" disabled={fetcher.state !== 'idle'} type="submit">
        Reverse
      </button>
      <MutationNotice result={fetcher.data} />
    </fetcher.Form>
  );
}

export const ErrorBoundary = AccountRouteError;
