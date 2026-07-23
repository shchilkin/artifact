import type { ReactNode } from 'react';

export function ProductPageHeader({
  actions,
  className,
  deck,
  eyebrow,
  meta,
  title,
  titleId,
}: {
  actions?: ReactNode;
  className?: string;
  deck: ReactNode;
  eyebrow: ReactNode;
  meta?: ReactNode;
  title: ReactNode;
  titleId?: string;
}) {
  return (
    <header className={['product-page-header', className].filter(Boolean).join(' ')}>
      <p className="product-page-header__eyebrow">{eyebrow}</p>
      <div className="product-page-header__body">
        <div className="product-page-header__copy">
          <h1 id={titleId}>{title}</h1>
          <p>{deck}</p>
        </div>
        {actions ? <div className="product-page-header__actions">{actions}</div> : null}
      </div>
      {meta ? <div className="product-page-header__meta">{meta}</div> : null}
    </header>
  );
}
