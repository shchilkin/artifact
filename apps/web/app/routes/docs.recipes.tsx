import type { MetaFunction } from 'react-router';

import { DocsLink, RECIPE_STARTERS, starterHref } from './docs.nodes';
import { DocsSection, DocsShell } from './docs.shared';

export const meta: MetaFunction = () => [
  { title: 'Recipes | Artifact Docs' },
  {
    name: 'description',
    content:
      'Artifact recipe docs for layer starts, graph starts, masks, line fields, repeated tokens, and export-ready posters.',
  },
];

const FEATURED_RECIPE_IDS = new Set([
  'recipe-masked-type-lines-graph',
  'recipe-rotated-circle-tokens-graph',
  'recipe-warped-line-poster-graph',
  'recipe-noise-matte-merge-graph',
]);

function recipeGroup(mode: string) {
  return mode.toLowerCase().includes('graph') ? 'Graph recipes' : 'Layer recipes';
}

export default function DocsRecipes() {
  const featuredRecipes = RECIPE_STARTERS.filter(({ starter }) => FEATURED_RECIPE_IDS.has(starter.id));
  const otherRecipes = RECIPE_STARTERS.filter(({ starter }) => !FEATURED_RECIPE_IDS.has(starter.id));

  return (
    <DocsShell
      active="Recipes"
      title="Recipes."
      deck="Open a complete document first, then change one decision. Recipes are the fastest way to learn how a workflow is wired."
    >
      <DocsSection id="new-workflows" eyebrow="v0.35" title="Masks, rotated repeats, and line fields.">
        <div className="docs-recipe-list docs-recipe-list--featured">
          {featuredRecipes.map(({ starter, mode, desc, steps }) => (
            <article key={starter.id} className="docs-recipe docs-recipe--feature">
              <div>
                <span className="docs-recipe__mode">{mode}</span>
                <h3>{starter.name}</h3>
                <p>{desc}</p>
                <div className="docs-recipe__steps">{steps.join(' / ')}</div>
              </div>
              <DocsLink href={starterHref(starter)} className="docs-recipe__link">
                Open recipe
              </DocsLink>
            </article>
          ))}
        </div>
      </DocsSection>

      <DocsSection id="all-recipes" eyebrow="Library" title="Choose by workflow shape.">
        <div className="docs-recipe-table">
          {otherRecipes.map(({ starter, mode, desc, steps }) => (
            <article key={starter.id} className="docs-recipe-row">
              <span className="docs-recipe__mode">{recipeGroup(mode)}</span>
              <div>
                <h3>{starter.name}</h3>
                <p>{desc}</p>
                <span>{steps.join(' / ')}</span>
              </div>
              <DocsLink href={starterHref(starter)}>Open</DocsLink>
            </article>
          ))}
        </div>
      </DocsSection>
    </DocsShell>
  );
}
