import { AdminRouteError } from '../components/RouteState';
import { Metric, PageHeader, PeriodField, StatusBadge } from '../components/Ui';
import { adminApi, currentUtcPeriod } from '../lib/adminApi';
import { formatInteger, formatMicroUsd } from '../lib/format';
import type { Route } from './+types/overview';

export async function clientLoader({ request }: Route.ClientLoaderArgs) {
  const url = new URL(request.url);
  const period = url.searchParams.get('period') || currentUtcPeriod();
  return adminApi.overview(period, request.signal);
}

export default function OverviewRoute({ loaderData }: Route.ComponentProps) {
  const budget = loaderData.safetyBudget;
  const budgetPercent = Math.min(100, (Number(budget.spentMicroUsd) / Math.max(1, Number(budget.limitMicroUsd))) * 100);
  return (
    <div className="page">
      <PageHeader
        eyebrow="Operations / overview"
        title="Monthly pulse"
        summary="Account access, generation volume, and provider spend for the selected UTC month."
        actions={<PeriodField value={loaderData.period} />}
      />

      <section className="metric-strip" aria-label="Monthly totals">
        <Metric
          label="Accounts"
          value={formatInteger(loaderData.accounts.total)}
          detail={`${loaderData.accounts.creator} Creator`}
        />
        <Metric
          label="Generations"
          value={formatInteger(loaderData.generations.committed)}
          detail={`${loaderData.generations.reserved} reserved`}
        />
        <Metric
          label="Provider spend"
          value={formatMicroUsd(loaderData.providerUsage.costMicroUsd)}
          detail={`${loaderData.providerUsage.failedCalls} failed calls`}
        />
        <Metric
          label="Tokens"
          value={formatInteger(
            Number(loaderData.providerUsage.inputTokens) + Number(loaderData.providerUsage.outputTokens),
          )}
          detail="input + output"
        />
      </section>

      <div className="overview-columns">
        <section className="content-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Account tiers</p>
              <h2>Distribution</h2>
            </div>
            <span>{loaderData.accounts.total} total</span>
          </div>
          <div className="tier-distribution" aria-label="Account tier distribution">
            <TierRow label="Free" count={loaderData.accounts.free} total={loaderData.accounts.total} />
            <TierRow label="Creator" count={loaderData.accounts.creator} total={loaderData.accounts.total} />
            <TierRow label="Founder" count={loaderData.accounts.founder} total={loaderData.accounts.total} />
          </div>
        </section>

        <section className="content-section budget-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Safety budget</p>
              <h2>{formatMicroUsd(budget.spentMicroUsd)} spent</h2>
            </div>
            <StatusBadge value={budget.state} />
          </div>
          <div className="budget-track" aria-label={`${budgetPercent.toFixed(0)} percent of safety budget used`}>
            <span style={{ width: `${budgetPercent}%` }} />
          </div>
          <dl className="budget-legend">
            <div>
              <dt>Warning</dt>
              <dd>{formatMicroUsd(budget.warningMicroUsd)}</dd>
            </div>
            <div>
              <dt>Hard stop</dt>
              <dd>{formatMicroUsd(budget.limitMicroUsd)}</dd>
            </div>
            <div>
              <dt>Remaining</dt>
              <dd>
                {formatMicroUsd(String(Math.max(0, Number(budget.limitMicroUsd) - Number(budget.spentMicroUsd))))}
              </dd>
            </div>
          </dl>
        </section>
      </div>
    </div>
  );
}

function TierRow({ count, label, total }: { count: number; label: string; total: number }) {
  const percent = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="tier-row">
      <span>{label}</span>
      <div>
        <i style={{ width: `${percent}%` }} />
      </div>
      <strong>{count}</strong>
    </div>
  );
}

export const ErrorBoundary = AdminRouteError;
