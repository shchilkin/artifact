import {
  Button,
  ButtonLink,
  Field,
  InlineNotice,
  Input,
  NativeSelect,
  ProgressIndicator,
  Skeleton,
  Textarea,
} from '@artifact/ui';
import { ControlSection, DataTable, Metric, MutationNotice, Pagination, StatusBadge } from './backoffice-ui';

const specimenStates = [
  {
    kind: 'signed-out',
    eyebrow: 'Session',
    title: 'Sign in to continue',
    message: 'Use an Artifact account with Admin access.',
  },
  {
    kind: 'denied',
    eyebrow: 'Authorization',
    title: 'Admin access required',
    message: 'The current account cannot open Artifact operations.',
  },
  {
    kind: 'empty',
    eyebrow: 'Empty result',
    title: 'No matching records',
    message: 'The current filters did not return operational records.',
  },
  {
    kind: 'error',
    eyebrow: 'Service state',
    title: 'Data could not be loaded',
    message: 'The account service did not complete the request.',
  },
] as const;

export function OperationalShellSpecimen() {
  return (
    <div className="operational-shell-specimen">
      <header className="operational-shell-specimen__topbar">
        <span className="operational-shell-specimen__brand">
          <span className="brand-mark" aria-hidden="true">
            A
          </span>
          <span>
            <strong>artifact</strong>
            <small>backoffice</small>
          </span>
        </span>
        <nav className="operational-shell-specimen__nav" aria-label="Backoffice specimen">
          <ButtonLink aria-current="page" size="compact" to="/style-guide" variant="quiet">
            Overview
          </ButtonLink>
          <ButtonLink size="compact" to="/accounts" variant="quiet">
            Accounts
          </ButtonLink>
          <ButtonLink size="compact" to="/usage" variant="quiet">
            Provider usage
          </ButtonLink>
        </nav>
        <Button aria-label="Sign out specimen" disabled size="compact" variant="quiet">
          Sign out
        </Button>
      </header>
      <div className="operational-shell-specimen__workspace">
        <div>
          <p className="eyebrow">Operations / overview</p>
          <strong>Monthly pulse</strong>
        </div>
        <InlineNotice>Navigation preserves the current operational context while data refreshes.</InlineNotice>
      </div>
    </div>
  );
}

export function OperationalRouteStateSpecimens() {
  return (
    <div className="operational-route-state-grid">
      {specimenStates.map((state) => (
        <article className={`operational-route-state operational-route-state--${state.kind}`} key={state.kind}>
          <p className="eyebrow">{state.eyebrow}</p>
          <h3>{state.title}</h3>
          <p>{state.message}</p>
        </article>
      ))}
      <article className="operational-route-state operational-route-state--loading">
        <p className="eyebrow">Loading</p>
        <Skeleton className="operational-route-state__loading-title" label="Loading account data" shape="block" />
        <Skeleton />
        <Skeleton />
      </article>
    </div>
  );
}

export function OperationalDataSpecimens() {
  return (
    <div className="operational-pattern-grid">
      <article className="operational-pattern-specimen">
        <h3>Page framing and metrics</h3>
        <div className="operational-page-heading-specimen">
          <div>
            <p className="eyebrow">Operations / overview</p>
            <strong>Monthly pulse</strong>
            <p>Account access, generation volume, and provider spend for one UTC month.</p>
          </div>
          <StatusBadge value="normal" />
        </div>
        <div className="metric-strip operational-metric-specimen" aria-label="Operational metric specimen">
          <Metric label="Accounts" value="8" detail="3 Creator" />
          <Metric label="Generations" value="18" detail="2 reserved" />
          <Metric label="Provider spend" value="$0.42" detail="2 failed calls" />
        </div>
        <ProgressIndicator label="Safety budget specimen" value={34} />
      </article>

      <article className="operational-pattern-specimen">
        <h3>Filtering, tables, and pagination</h3>
        <div className="filter-bar operational-filter-specimen" role="search">
          <Field label="Search accounts">
            <Input placeholder="Email or account ID" type="search" />
          </Field>
          <Field label="UTC period">
            <Input defaultValue="2026-07" type="month" />
          </Field>
          <Button variant="primary">Search</Button>
        </div>
        <DataTable
          columns={[
            { key: 'account', label: 'Account' },
            { key: 'tier', label: 'Tier' },
            { key: 'status', label: 'Status' },
          ]}
          label="Operational account table specimen"
        >
          <tr>
            <td>creator@example.com</td>
            <td>
              <StatusBadge value="creator" />
            </td>
            <td>9 generations</td>
          </tr>
        </DataTable>
        <Pagination hasMore={false} limit={25} offset={0} total={1} />
      </article>

      <article className="operational-pattern-specimen">
        <h3>Audited mutation controls</h3>
        <ControlSection
          eyebrow="Account tier"
          headingLevel={4}
          title="Change access specimen"
          copy="Changes remain attributable and preserve current usage."
          badge={<StatusBadge value="creator" />}
        >
          <div className="operational-form-specimen">
            <Field label="New tier">
              <NativeSelect defaultValue="creator">
                <option value="free">Free</option>
                <option value="creator">Creator</option>
                <option value="founder">Founder</option>
              </NativeSelect>
            </Field>
            <Field label="Reason for change">
              <Textarea defaultValue="Approved account correction" rows={2} />
            </Field>
            <Button variant="primary">Save change</Button>
          </div>
          <MutationNotice result={{ ok: true, message: 'The audited account change is recorded.' }} />
        </ControlSection>
      </article>

      <article className="operational-pattern-specimen">
        <h3>Operation recovery</h3>
        <ControlSection
          eyebrow="AI operations"
          headingLevel={4}
          title="Recovery preview specimen"
          copy="Review recoverable results before applying an audited correction."
        >
          <dl className="operation-recovery-summary" aria-label="Operation recovery specimen">
            <div>
              <dt>Ready to finalize</dt>
              <dd>1</dd>
            </div>
            <div>
              <dt>Ready to close</dt>
              <dd>1</dd>
            </div>
            <div>
              <dt>Checked</dt>
              <dd>10:00</dd>
            </div>
          </dl>
          <div className="operational-form-specimen">
            <Field label="Recovery reason">
              <Textarea placeholder="Why is manual recovery needed?" rows={2} />
            </Field>
            <Button variant="primary">Recover operations</Button>
          </div>
          <div className="operational-form-specimen" data-operational-state="recovery-pending">
            <Field label="Recovery reason while pending">
              <Textarea disabled defaultValue="Finalize completed production results" rows={2} />
            </Field>
            <Button disabled loading variant="primary">
              Recovering...
            </Button>
          </div>
          <div data-operational-state="recovery-repeated">
            <MutationNotice result={{ ok: true, message: 'This recovery request was already applied.' }} />
          </div>
          <div data-operational-state="recovery-failure">
            <MutationNotice
              result={{
                ok: false,
                code: 'admin_operation_reconciliation_rate_limited',
                message: 'Operation recovery was run recently. Wait a moment, then try again.',
              }}
            />
          </div>
        </ControlSection>
      </article>
    </div>
  );
}
