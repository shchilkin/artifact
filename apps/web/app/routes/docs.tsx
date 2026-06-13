import { Link, type MetaFunction } from 'react-router';
import { DocsShell } from './docs.shared';

export const meta: MetaFunction = () => [
  { title: 'Docs | Artifact' },
  {
    name: 'description',
    content: 'Start from Artifact editor docs, node and effect reference, recipes, and the project style guide.',
  },
];

const DOC_SECTIONS = [
  {
    eyebrow: 'Learn',
    title: 'Learn the model',
    body: 'A short path through layers, graph branches, previews, and export without the full reference in the way.',
    href: '/docs/nodes',
    action: 'Open learn guide',
  },
  {
    eyebrow: 'Recipes',
    title: 'Open a workflow',
    body: 'Start from working documents for masks, line fields, repeated tokens, photo type, texture stacks, and print damage.',
    href: '/docs/recipes',
    action: 'Open recipes',
  },
  {
    eyebrow: 'Reference',
    title: 'Look up a node',
    body: 'Find exact node controls, graph utilities, effect families, blend modes, files, and recovery checks.',
    href: '/docs/reference',
    action: 'Open reference',
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
    <DocsShell
      active="Overview"
      title="Docs."
      deck="Choose the kind of help you need: learn the model, open a recipe, look up a node, or inspect the UI system."
    >
      <section className="docs-search-panel" aria-labelledby="docs-index-start-title">
        <div className="docs-search-panel__header">
          <div>
            <span className="docs-guide-section__eyebrow">Start here</span>
            <h2 id="docs-index-start-title">Choose a docs path.</h2>
          </div>
          <span className="docs-search-count">{DOC_SECTIONS.length} paths</span>
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
    </DocsShell>
  );
}
