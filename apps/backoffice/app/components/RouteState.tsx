import { Link, useLocation } from 'react-router';
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
        <Link className="primary-button" to={`/sign-in?returnTo=${encodeURIComponent(returnTo)}`}>
          Sign in
        </Link>
      }
    />
  ),
  403: () => (
    <RouteState
      kind="denied"
      title="Admin access required"
      message="This account is signed in, but it is not allowed to open Artifact operations."
      action={
        <Link className="quiet-button" to="/sign-in">
          Use another account
        </Link>
      }
    />
  ),
  404: () => (
    <RouteState
      kind="empty"
      title="Account not found"
      message="The account may have been removed or the link may be out of date."
      action={
        <Link className="quiet-button" to="/accounts">
          Back to accounts
        </Link>
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
    <div className="page-skeleton" aria-label={label} aria-busy="true">
      <div className="skeleton-line wide" />
      <div className="skeleton-line" />
      <div className="skeleton-grid">
        <div />
        <div />
        <div />
        <div />
      </div>
      <div className="skeleton-table" />
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
      message={error instanceof Error ? error.message : 'The service did not complete the request.'}
      action={
        <button className="primary-button" type="button" onClick={() => window.location.reload()}>
          Try again
        </button>
      }
    />
  );
}

function renderKnownAdminError(error: unknown, returnTo: string) {
  if (!(error instanceof AdminApiError)) return null;
  return adminErrorRenderers[error.status]?.(returnTo) ?? null;
}
