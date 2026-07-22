import type { ReactNode } from 'react';
import { Link, NavLink } from 'react-router';

import { PublicPageLayout } from '../components/PublicPageLayout';
import { ProductPageHeader } from '../components/product-surfaces/ProductPageHeader';

const DOCS_NAV_ITEMS = [
  {
    label: 'Overview',
    href: '/docs',
    desc: 'Choose a docs path',
  },
  {
    label: 'Learn',
    href: '/docs/nodes',
    desc: 'Layers, nodes, export',
  },
  {
    label: 'Recipes',
    href: '/docs/recipes',
    desc: 'Open working documents',
  },
  {
    label: 'Reference',
    href: '/docs/reference',
    desc: 'Nodes, effects, files',
  },
  {
    label: 'Style Guide',
    href: '/docs/style-guide',
    desc: 'UI primitives',
  },
] as const;

export function DocsShell({
  active,
  children,
  deck,
  eyebrow = 'Artifact docs',
  title,
}: {
  active: (typeof DOCS_NAV_ITEMS)[number]['label'];
  children: ReactNode;
  deck: string;
  eyebrow?: string;
  title: string;
}) {
  return (
    <PublicPageLayout className="docs-page docs-page--sectioned">
      <div className="docs-shell">
        <aside className="docs-sidebar">
          <Link to="/docs" className="docs-sidebar__brand">
            <span>Artifact</span>
            <strong>Docs</strong>
          </Link>
          <nav className="docs-sidebar__nav" aria-label="Docs navigation">
            {DOCS_NAV_ITEMS.map((item) => (
              <NavLink
                key={item.href}
                to={item.href}
                end={item.href === '/docs'}
                className={({ isActive }) =>
                  `docs-sidebar__link${isActive || item.label === active ? ' docs-sidebar__link--active' : ''}`
                }
              >
                <span>{item.label}</span>
                <small>{item.desc}</small>
              </NavLink>
            ))}
          </nav>
        </aside>
        <main className="docs-main">
          <ProductPageHeader
            className="docs-hero"
            deck={deck}
            eyebrow={eyebrow}
            title={title}
            titleId="docs-page-title"
          />
          {children}
        </main>
      </div>
    </PublicPageLayout>
  );
}

export function DocsSection({
  id,
  eyebrow,
  title,
  children,
}: {
  id?: string;
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  const titleId = `${id ?? `docs-${eyebrow.toLowerCase().replace(/\s+/g, '-')}`}-title`;
  return (
    <section id={id} className="docs-guide-section docs-guide-section--stacked" aria-labelledby={titleId}>
      <div className="docs-guide-section__header">
        <span className="docs-guide-section__eyebrow">{eyebrow}</span>
        <h2 id={titleId} className="docs-guide-section__title">
          {title}
        </h2>
      </div>
      <div className="docs-guide-section__body">{children}</div>
    </section>
  );
}
