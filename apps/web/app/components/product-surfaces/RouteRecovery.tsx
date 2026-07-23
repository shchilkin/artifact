import type { ReactNode } from 'react';

import { ActionLink } from '../ui/ActionButton';

export function RouteRecovery({
  detail,
  diagnostics,
  eyebrow = 'Artifact',
  title,
}: {
  detail: ReactNode;
  diagnostics?: ReactNode;
  eyebrow?: ReactNode;
  title: ReactNode;
}) {
  return (
    <section className="product-route-recovery" aria-labelledby="product-route-recovery-title">
      <div className="product-route-recovery__mark" aria-hidden="true">
        <span />
        <span />
      </div>
      <p className="product-route-recovery__eyebrow">{eyebrow}</p>
      <h1 id="product-route-recovery-title">{title}</h1>
      <p className="product-route-recovery__detail">{detail}</p>
      <div className="product-route-recovery__actions">
        <ActionLink to="/" variant="secondary">
          Return home
        </ActionLink>
        <ActionLink to="/app?new=blank" variant="primary">
          Open editor
        </ActionLink>
      </div>
      {diagnostics ? <div className="product-route-recovery__diagnostics">{diagnostics}</div> : null}
    </section>
  );
}
