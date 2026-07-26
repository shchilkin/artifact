import { ButtonLink } from '@artifact/ui';
import type { ReactNode } from 'react';

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
        <ButtonLink to="/" variant="secondary">
          Return home
        </ButtonLink>
        <ButtonLink to="/app?new=blank" variant="primary">
          Open editor
        </ButtonLink>
      </div>
      {diagnostics ? <div className="product-route-recovery__diagnostics">{diagnostics}</div> : null}
    </section>
  );
}
