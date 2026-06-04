import { Link, type MetaFunction } from 'react-router';
import { PublicPageLayout } from '../components/PublicPageLayout';

export const meta: MetaFunction = () => [
  { title: 'Docs | Artifact' },
  {
    name: 'description',
    content: 'Start from Artifact editor docs, node and effect reference, recipes, and the project style guide.',
  },
];

const DOC_SECTIONS = [
  {
    eyebrow: 'Editor guide',
    title: 'Learn the editor',
    body: 'Layers, nodes, effects, sources, recipes, export, and project packaging in one searchable guide.',
    href: '/docs/nodes',
    action: 'Open editor docs',
  },
  {
    eyebrow: 'UI system',
    title: 'Style guide',
    body: 'Design tokens, shared primitives, component states, navigation, panels, overlays, and inspector patterns.',
    href: '/docs/style-guide',
    action: 'Open style guide',
  },
  {
    eyebrow: 'Start working',
    title: 'Blank canvas',
    body: 'Open the editor with an empty document, add sources, shape layers, route nodes, and export when ready.',
    href: '/app?new=blank',
    action: 'Open editor',
  },
] as const;

export default function DocsIndex() {
  return (
    <PublicPageLayout className="docs-page">
      <main className="docs-feed">
        <section className="docs-intro" aria-labelledby="docs-index-title">
          <p className="docs-guide-section__eyebrow">Artifact docs</p>
          <h1 id="docs-index-title" className="docs-intro__headline">
            Docs.
          </h1>
          <p className="docs-intro__deck">
            Find the editor guide, reference material, recipes, component states, and design-system rules for Artifact.
          </p>
        </section>

        <section className="docs-search-panel" aria-labelledby="docs-index-start-title">
          <div className="docs-search-panel__header">
            <div>
              <span className="docs-guide-section__eyebrow">Start here</span>
              <h2 id="docs-index-start-title">Choose a docs path.</h2>
            </div>
            <span className="docs-search-count">3 paths</span>
          </div>
          <div className="docs-start-points docs-start-points--index">
            {DOC_SECTIONS.map((section) => (
              <Link key={section.href} to={section.href} className="docs-start-point">
                <span className="docs-start-point__action">{section.eyebrow}</span>
                <strong>{section.title}</strong>
                <span>{section.body}</span>
                <span className="docs-start-point__action">{section.action}</span>
              </Link>
            ))}
          </div>
        </section>
      </main>
    </PublicPageLayout>
  );
}
