import { Button, ButtonLink, Skeleton } from '@artifact/ui';
import { useLocation } from 'react-router';
import { AdminApiError } from '../lib/adminApi';

type RouteStateKind = 'denied' | 'empty' | 'error' | 'loading' | 'signed-out';

type AdminErrorRenderer = (returnTo: string) => React.ReactNode;

const adminErrorRenderers: Partial<Record<number, AdminErrorRenderer>> = {
  401: (returnTo) => (
    <RouteState
      kind="signed-out"
      title="Sign in to continue"
      message="Use an Artifact account with Admin access."
      action={
        <ButtonLink variant="primary" to={`/sign-in?returnTo=${encodeURIComponent(returnTo)}`}>
          Sign in
        </ButtonLink>
      }
    />
  ),
  403: () => (
    <RouteState
      kind="denied"
      title="Admin access required"
      message="This account is signed in, but it is not allowed to open Artifact operations."
      action={
        <ButtonLink variant="quiet" to="/sign-in">
          Use another account
        </ButtonLink>
      }
    />
  ),
  404: () => (
    <RouteState
      kind="error"
      title="Admin API route unavailable"
      message="The deployed account service does not expose this backoffice route yet."
      action={
        <ButtonLink variant="quiet" to="/">
          Back to overview
        </ButtonLink>
      }
    />
  ),
};

export function RouteState({
  action,
  kind,
  message,
  title,
}: {
  action?: React.ReactNode;
  kind: RouteStateKind;
  message: string;
  title: string;
}) {
  return (
    <main className={`route-state ${kind}`}>
      <div className="state-symbol" aria-hidden="true">
        {kind === 'loading' ? '•••' : kind === 'empty' ? '0' : '!'}
      </div>
      <p className="eyebrow">Artifact operations</p>
      <h1>{title}</h1>
      <p>{message}</p>
      {action ? <div className="state-actions">{action}</div> : null}
    </main>
  );
}

export function RouteSkeleton({ label = 'Loading account data' }: { label?: string }) {
  return (
    <div className="page-skeleton" aria-busy="true">
      <Skeleton className="skeleton-line wide" label={label} shape="block" />
      <Skeleton className="skeleton-line" />
      <div className="skeleton-grid">
        <Skeleton shape="block" />
        <Skeleton shape="block" />
        <Skeleton shape="block" />
        <Skeleton shape="block" />
      </div>
      <Skeleton className="skeleton-table" shape="block" />
    </div>
  );
}

export function AdminRouteError({ error }: { error: unknown }) {
  const location = useLocation();
  const rendered = renderKnownAdminError(error, location.pathname + location.search);
  if (rendered) return rendered;
  return (
    <RouteState
      kind="error"
      title="Data could not be loaded"
      message={error instanceof AdminApiError ? error.message : 'The account service did not complete the request.'}
      action={
        <Button variant="primary" onClick={() => window.location.reload()}>
          Try again
        </Button>
      }
    />
  );
}

export function AccountRouteError({ error }: { error: unknown }) {
  if (error instanceof AdminApiError && error.status === 404) {
    return (
      <RouteState
        kind="empty"
        title="Account not found"
        message="The account may have been removed or the link may be out of date."
        action={
          <ButtonLink variant="quiet" to="/accounts">
            Back to accounts
          </ButtonLink>
        }
      />
    );
  }
  return <AdminRouteError error={error} />;
}

function renderKnownAdminError(error: unknown, returnTo: string) {
  if (!(error instanceof AdminApiError)) return null;
  return adminErrorRenderers[error.status]?.(returnTo) ?? null;
}
