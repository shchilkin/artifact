import type { ReactNode } from 'react';
import { Footer } from './Footer';
import { SiteNav } from './SiteNav';

export function PublicPageLayout({
  children,
  navSolid = true,
  className,
}: {
  children: ReactNode;
  navSolid?: boolean;
  className?: string;
}) {
  return (
    <div className={['product-route-layout', className].filter(Boolean).join(' ')}>
      <SiteNav solid={navSolid} />
      {children}
      <Footer />
    </div>
  );
}
