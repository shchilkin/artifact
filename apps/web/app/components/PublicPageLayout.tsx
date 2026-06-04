import type { ReactNode } from 'react';
import { Footer } from './Footer';
import { SiteNav } from './SiteNav';

export function PublicPageLayout({
  children,
  navSolid = true,
  className = 'min-h-dvh bg-bg flex flex-col',
}: {
  children: ReactNode;
  navSolid?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <SiteNav solid={navSolid} />
      {children}
      <Footer />
    </div>
  );
}
