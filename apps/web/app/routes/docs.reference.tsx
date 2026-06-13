import { useMemo, useState } from 'react';
import { Link, type MetaFunction } from 'react-router';

import { SearchField } from '../components/ui/SearchField';
import { EFFECT_FAMILY_GUIDE } from '../utils/effectDocs';
import {
  ALL_NODES,
  BLEND_GUIDE,
  GRAPH_UTILITY_GUIDE,
  MOTIF_RECIPE_GUIDE,
  nodeTypeLabel,
  PRACTICAL_BLEND_GUIDE,
  PROJECT_FILE_GUIDE,
  SOURCE_RECIPE_GUIDE,
  TROUBLESHOOTING_GUIDE,
} from './docs.nodes';
import { DocsSection, DocsShell } from './docs.shared';

export const meta: MetaFunction = () => [
  { title: 'Reference | Artifact Docs' },
  {
    name: 'description',
    content: 'Artifact reference for nodes, effects, graph utilities, blend modes, project files, and troubleshooting.',
  },
];

const REFERENCE_FILTERS = ['all', 'content', 'source', 'effect'] as const;
type ReferenceFilter = (typeof REFERENCE_FILTERS)[number];

function nodeFilterLabel(nodeId: string): ReferenceFilter {
  if (['fill', 'image', 'text', 'emoji'].includes(nodeId)) return 'content';
  if (['primitive', 'noise', 'array', 'lineField'].includes(nodeId)) return 'source';
  return 'effect';
}

function nodeMatches(query: string, filter: ReferenceFilter, node: (typeof ALL_NODES)[number]) {
  if (filter !== 'all' && nodeFilterLabel(node.id) !== filter) return false;
  if (!query) return true;
  const haystack = `${node.name} ${node.desc} ${node.params.map((param) => `${param.key} ${param.range}`).join(' ')}`;
  return haystack.toLowerCase().includes(query);
}

export default function DocsReference() {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ReferenceFilter>('all');
  const normalizedQuery = query.trim().toLowerCase();
  const visibleNodes = useMemo(
    () => ALL_NODES.filter((node) => nodeMatches(normalizedQuery, filter, node)),
    [filter, normalizedQuery],
  );

  return (
    <DocsShell
      active="Reference"
      title="Reference."
      deck="Use this page when you already know what you need to look up: a node, a control, a file type, or a recovery check."
    >
      <section className="docs-reference-search" aria-labelledby="reference-search-title">
        <div>
          <span className="docs-guide-section__eyebrow">Lookup</span>
          <h2 id="reference-search-title">Find a node or effect.</h2>
        </div>
        <SearchField
          aria-label="Search node reference"
          placeholder="Search mask, line field, grain, export..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onClear={() => setQuery('')}
        />
        <div className="docs-type-filter docs-type-filter--inline" aria-label="Filter reference nodes">
          {REFERENCE_FILTERS.map((item) => (
            <button
              type="button"
              key={item}
              className={`docs-type-filter__item${filter === item ? ' docs-type-filter__item--active' : ''}`}
              onClick={() => setFilter(item)}
            >
              {item}
            </button>
          ))}
        </div>
        <span className="docs-search-count">{visibleNodes.length} nodes</span>
      </section>

      <DocsSection id="nodes" eyebrow="Node library" title="Open the exact node.">
        <div className="docs-reference-list">
          {visibleNodes.map((node) => (
            <Link key={node.id} to={`/docs/reference/${node.id}`} className="docs-reference-row">
              <span className="docs-reference-row__symbol" aria-hidden="true">
                {node.symbol}
              </span>
              <div>
                <span className="docs-recipe__mode">{nodeTypeLabel(node)}</span>
                <h3>{node.name}</h3>
                <p>{node.desc}</p>
              </div>
              <span>Open</span>
            </Link>
          ))}
        </div>
      </DocsSection>

      <DocsSection id="utilities" eyebrow="Graph utilities" title="Branches, masks, color, and output helpers.">
        <div className="docs-reference-grid docs-reference-grid--dense">
          {GRAPH_UTILITY_GUIDE.map((utility) => (
            <article key={utility.name} className="docs-reference-item">
              <h3>{utility.name}</h3>
              <p>{utility.desc}</p>
            </article>
          ))}
        </div>
      </DocsSection>

      <DocsSection id="sources" eyebrow="Source patterns" title="When the material should stay editable.">
        <div className="docs-reference-grid">
          {[...SOURCE_RECIPE_GUIDE, ...MOTIF_RECIPE_GUIDE].map((recipe) => (
            <article key={recipe.name} className="docs-reference-item">
              <h3>{recipe.name}</h3>
              <p>{recipe.desc}</p>
            </article>
          ))}
        </div>
      </DocsSection>

      <DocsSection id="effects" eyebrow="Effect families" title="Pick one family first.">
        <div className="docs-reference-grid docs-reference-grid--dense">
          {EFFECT_FAMILY_GUIDE.map((family) => (
            <article key={family.name} className="docs-reference-item">
              <h3>{family.name}</h3>
              <p>{family.desc}</p>
            </article>
          ))}
        </div>
      </DocsSection>

      <DocsSection id="blend-modes" eyebrow="Blend modes" title="Think in cover-making jobs, not math.">
        <div className="docs-reference-grid">
          {PRACTICAL_BLEND_GUIDE.map((mode) => (
            <article key={mode.name} id={`blend-${mode.name.toLowerCase()}`} className="docs-reference-item">
              <h3>{mode.name}</h3>
              <p>{mode.desc}</p>
            </article>
          ))}
        </div>
        <details className="docs-details">
          <summary>Full blend mode notes</summary>
          <div className="docs-compact-grid">
            {BLEND_GUIDE.map((mode) => (
              <div key={mode.name}>
                <span>{mode.name}</span>
                <p>{mode.desc}</p>
              </div>
            ))}
          </div>
        </details>
      </DocsSection>

      <DocsSection id="project-files" eyebrow="Project files" title="Choose by what needs to survive.">
        <div className="docs-reference-grid">
          {PROJECT_FILE_GUIDE.map((item) => (
            <article key={item.name} className="docs-reference-item">
              <h3>{item.name}</h3>
              <p>{item.desc}</p>
            </article>
          ))}
        </div>
      </DocsSection>

      <DocsSection id="troubleshooting" eyebrow="Troubleshooting" title="Fast checks when the result is wrong.">
        <div className="docs-trouble-list">
          {TROUBLESHOOTING_GUIDE.map((item) => (
            <article key={item.name} className="docs-trouble">
              <h3>{item.name}</h3>
              <p>{item.desc}</p>
            </article>
          ))}
        </div>
      </DocsSection>
    </DocsShell>
  );
}
