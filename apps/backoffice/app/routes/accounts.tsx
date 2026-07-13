import { Form, Link, useLocation } from 'react-router';
import { AdminRouteError } from '../components/RouteState';
import { DataTable, PageHeader, Pagination, StatusBadge } from '../components/Ui';
import { adminApi, currentUtcPeriod } from '../lib/adminApi';
import { formatMicroUsd, formatTimestamp } from '../lib/format';
import { emptyTableState } from '../lib/tableState';
import type { Route } from './+types/accounts';

const accountColumns = [
  { key: 'account', label: 'Account' },
  { key: 'tier', label: 'Tier' },
  { key: 'generations', label: 'Generations' },
  { key: 'spend', label: 'Provider spend' },
  { key: 'failures', label: 'Failures' },
  { key: 'updated', label: 'Updated' },
  { key: 'open', screenReaderLabel: 'Open' },
] as const;

export async function clientLoader({ request }: Route.ClientLoaderArgs) {
  const url = new URL(request.url);
  return adminApi.accounts(
    {
      period: url.searchParams.get('period') || currentUtcPeriod(),
      q: url.searchParams.get('q') || undefined,
      limit: readPageValue(url.searchParams.get('limit'), 25),
      offset: readPageValue(url.searchParams.get('offset'), 0),
    },
    request.signal,
  );
}

export default function AccountsRoute({ loaderData }: Route.ComponentProps) {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  return (
    <div className="page">
      <PageHeader
        eyebrow="Operations / accounts"
        title="Account access"
        summary="Search identity metadata, review monthly usage, and open audited access controls."
      />
      <Form className="filter-bar" method="get" role="search">
        <label className="search-field">
          <span>Search accounts</span>
          <input defaultValue={searchParams.get('q') ?? ''} name="q" placeholder="Email or account ID" type="search" />
        </label>
        <label>
          <span>UTC period</span>
          <input defaultValue={searchParams.get('period') ?? currentUtcPeriod()} name="period" type="month" />
        </label>
        <button className="primary-button" type="submit">
          Search
        </button>
      </Form>

      <section className="table-section" aria-labelledby="accounts-table-title">
        <div className="section-heading compact">
          <div>
            <p className="eyebrow">Directory</p>
            <h2 id="accounts-table-title">{loaderData.page.total} accounts</h2>
          </div>
        </div>
        <DataTable
          columns={accountColumns}
          empty={emptyTableState(
            loaderData.accounts.length,
            'No accounts found',
            'Try a broader email or account ID search.',
          )}
        >
          {loaderData.accounts.map((account) => (
            <tr key={account.id}>
              <td>
                <strong>{account.email ?? 'No email'}</strong>
                <small>{account.id}</small>
              </td>
              <td>
                <StatusBadge value={account.tier} />
              </td>
              <td>
                {account.generations.committed}
                <small>{account.generations.reserved} reserved</small>
              </td>
              <td>{formatMicroUsd(account.providerCostMicroUsd)}</td>
              <td className={account.failedCalls > 0 ? 'danger-text' : ''}>{account.failedCalls}</td>
              <td>{formatTimestamp(account.updatedAt)}</td>
              <td>
                <Link className="row-link" to={`/accounts/${encodeURIComponent(account.id)}${location.search}`}>
                  Open
                </Link>
              </td>
            </tr>
          ))}
        </DataTable>
        <Pagination {...loaderData.page} />
      </section>
    </div>
  );
}

function readPageValue(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

export const ErrorBoundary = AdminRouteError;
