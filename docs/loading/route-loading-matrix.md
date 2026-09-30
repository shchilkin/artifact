# Route Loading Matrix

Normative loading contract for
[v0.49 Application Shell And Loading Boundaries](../version-plans/v0.49.md).
The machine-readable contract is
[`route-loading-contract.json`](./route-loading-contract.json). Measurements:

- [`route-loading-baseline-v0.48.1.json`](./route-loading-baseline-v0.48.1.json):
  the v0.48.1 reference, recorded before any v0.49 change.
- [`route-loading-current.json`](./route-loading-current.json): the latest
  measurement. Every change that affects loading regenerates it.

## Measuring

```bash
npm run loading:current
npm run test:loading
```

`loading:current` builds the web app with client source maps and runs
`scripts/loading/route-loading-baseline.mjs`. The script reads the React Router
route manifest from `apps/web/build/client`, serves the build with
`vite preview` (SPA fallback, like the production rewrite), and records every
same-origin JS and CSS request in Chromium with the service worker blocked, so
each state is a first visit. It records:

- `initial`: everything requested on the first visit.
- `afterRender`: the part of `initial` that the route did not need to render;
  these files arrive through dynamic imports after the first render.
- `activation`: what a user action adds (open Nodes, add a 3D layer).

Asset names are stored without content hashes. Sizes are gzip level 9 of the
built file without its source-map comment, so they match a production build.
Each asset lists the dependency families found in its source map. Rules use
those families, not chunk file names: file names follow whichever module
Rolldown saw first, so a name like `lib.js` or `jsx-runtime.js` says nothing
about ownership.

`npm run test:loading` (part of `npm run check`) checks the contract against
`route-loading-current.json`: budgets, prohibited families before render, and
allowed families after render or on activation.

## Families

| Family | Sources |
| --- | --- |
| react | `react`, `react-dom`, `scheduler` |
| react-router | `react-router`, `@react-router/*` |
| motion | `framer-motion`, `motion-dom`, `motion-utils` |
| react-flow | `@xyflow/*`, `d3-*` |
| pixi | `pixi.js`, `@pixi/*` |
| three | `three` |
| renderer | `app/utils/render/`, `renderer.ts`, `pixiFilters`, `gpuRender` |
| node-canvas | `app/components/node-canvas/` except the shared `inspector/`, `constants.ts`, `helpers.ts`, and `nodes/NoPan.tsx` |

## Matrix

Sizes are gzip KiB of JavaScript. "Before render" is `initial` minus
`afterRender`.

| State | URL | Owning shell | Delivery | v0.48.1 | Current | Budget |
| --- | --- | --- | --- | --- | --- | --- |
| Home, before render | `/` | public | prerender | 423.6 | 130.4 | 170 |
| Home, after render (hero) | `/` | home route | — | (in v0.48.1 initial) | +180.0 | +185 |
| Docs | `/docs` | public | prerender | 240.4 | 118.5 | 170 |
| Account recovery | `/reset-password` | public | SPA fallback | 239.6 | 118.9 | 170 |
| Projects | `/projects` | account | SPA fallback | 312.8 | 218.0 | 230 |
| Editor, blank Layers | `/app` | editor | SPA fallback | 414.4 | 321.0 | 370 |
| Nodes activation | Nodes tab | NodeCanvas | — | +65.4 | +119.4 | +135 |
| Style guide | `/docs/style-guide` | public | SPA fallback | 402.4 | 361.7 | 370 |
| First 3D activation | add Primitive | primitive scene renderer | — | +206.7 | +182.5 | +215 |

The Nodes activation grew because React Flow now loads with the node canvas
instead of on every route. The style guide budget is 370 rather than the
first-draft 360: its live node-canvas specimens need React Flow, so that
dependency cannot leave the route.

| State | Prohibited before render | Allowed later or owned exceptions |
| --- | --- | --- |
| Home | react-flow, pixi, three, renderer, node-canvas | After render: pixi, renderer. Exceptions: motion (home animations), `config.js` (step content is built with document factories) |
| Docs, account recovery | react-flow, pixi, three, renderer, motion, node-canvas | — |
| Projects | react-flow, pixi, three, motion, node-canvas | renderer: project thumbnails |
| Editor, blank Layers | react-flow, pixi, three, node-canvas | motion, renderer; pixi once the document needs the WebGL pass |
| Nodes activation | — | react-flow, node-canvas |
| Style guide | pixi, three | node-canvas, react-flow, renderer: live specimens |
| First 3D activation | — | three |

CSS, gzip KiB, enforced since #240 (`enforcement.cssBudgets`):

| State | v0.48.1 | Current | Budget |
| --- | --- | --- | --- |
| Home | 38.4 | 12.4 | 24 |
| Docs | 38.4 | 14.4 | 24 |
| Account recovery | 38.4 | 10.4 | 24 |
| Projects | 41.1 | 16.8 | 26 |
| Editor, blank Layers | 44.2 | 28.9 | 50 |
| Nodes activation | +12.8 | +14.8 | +20 |
| Style guide | 60.4 | 48.9 | 65 |
| First 3D activation | +0 | +0 | +5 |

## CSS ownership

`app/index.css` (the root stylesheet) holds only what every route needs:
Tailwind, the UI foundation, tokens and the product theme, the base reset,
document and `#root` rules, site navigation and the logo mark, focus and
screen-reader utilities, and the route recovery page that the root error
boundary renders. It is 9.1 KiB gzip.

Surface styles live next to their owners and reach the page through one entry
file per route in `app/routes/styles/`. Each route module imports its entry
first, so the entry stays in the route chunk. React Router lists a route
chunk's CSS before the CSS of the chunks it imports, so the surface rules keep
the position they had in the global stylesheet: after the root stylesheet and
before shared component CSS such as `primitives.css`, `dialog.css`,
`inspector-system.css`, and `editor-workflow.css`, whose rules win ties with
them. A shared entry would be split into a common chunk whose order in the
route's CSS list is not fixed, which is why the docs routes each have their own
entry with the same imports.

| Owner file | Surfaces | Loaded by |
| --- | --- | --- |
| `routes/home.css` | home page | home |
| `routes/docs.shared.css` | docs pages | docs routes, style guide |
| `routes/docs.style-guide.surfaces.css` | style guide page | style guide |
| `routes/showcase.css` | showcase | showcase |
| `routes/projects.css` | Projects page | Projects |
| `routes/reset-password.css` | password reset | account recovery |
| `components/product-surfaces/product-surfaces.css` | page header, pattern specimens | docs, showcase, Projects, style guide |
| `components/projects-panel.css` | projects library panel | Projects, editor |
| `routes/editor/editor.css` | editor layout, canvas area, sidebar, bottom bar | editor, style guide |
| `components/layers-panel/layers-panel.css` | layer rows, areas, Add Library | editor, style guide |
| `components/node-canvas/inspector/inspector.css` | layer and node inspector | editor, style guide |
| `components/editor-target/editor-target.css`, `components/node-canvas/panel/node-properties-panel.css`, `components/ai-generation-panel.css`, `components/effect-info-popup.css` | editor panels | editor, style guide |
| `components/storage-workspace-status.css`, `routes/editor/empty-canvas-start.css` | editor status and empty start | editor |
| `components/account-panel.css` | account dialog | `AccountPanel`, on demand |
| `components/public-page-layout.css` | public footer | `PublicPageLayout` |

The account dialog and the public footer load at their component boundary
because no shared component CSS overrides them. The node canvas keeps
`node-canvas.css` and React Flow's stylesheet on the lazy `NodeCanvas` chunk;
3D chrome keeps `viewport-3d-chrome.css` on the viewport components.

The editor shell, sidebar, and bottom bar share one file, as do the layers panel
and Add Library, and the inspector-system and node inspector rules: their rules override each
other in both directions, so separate files would need an import order that
does not exist.

The split was checked by comparing every computed style (elements and
`::before`/`::after`) between the v0.48.1-shaped build and the split build on
home, all docs pages, account recovery, Projects, showcase, an unknown path,
the style guide, and the editor (blank, with layers, Add Library, effects, 3D,
layer actions, export, file dialog, Nodes, node add menu, node inspector) plus
client navigation, at 1440 and 390 px: no differences. Rules whose selectors
can no longer match (unused `btn`, `pa-*`, `toggle-switch`, `hero-cover`,
`landing-*`, `showcase-header`, `export-menu` classes and others) were removed.

`tests/browser/v049-css-ownership.spec.ts` checks the production build
(`vite preview`, run by `npm run test:browser:release`): public routes receive
no editor, inspector, node-canvas, or 3D selectors; surface CSS loads after the
root stylesheet and before shared component CSS; node-canvas CSS waits for the
Nodes tab; and style guide specimens receive their surface styles.

## Root shell

The root route owns only the HTML document, global tokens and theme, the route
outlet, the session provider, build info, service-worker registration, and route
recovery. Its static graph may contain `entry.client`, `rolldown-runtime`,
`authClient`, `apiBaseUrl`, `appBuildInfo`, `typography`, and the UI `commands`
module used by recovery links. Public navigation (`SiteNav`,
`PublicPageLayout`), the account dialog, form fields, feedback, the document
model (`config`), and Framer Motion are route-owned or loaded on demand and are
listed as prohibited in `rootGraph` in the contract.

Route families own their composition without layout routes, so URLs are
unchanged: public, docs, account recovery, showcase, and Projects routes render
`PublicPageLayout` themselves; the editor renders its own shell. The root error
boundary loads `PublicPageLayout` only when it has to show a recovery page and
shows the recovery content immediately while it loads.

## Delivery

Prerendered in v0.49: `/`, `/docs`, `/docs/nodes`, `/docs/recipes`,
`/docs/reference`. Live previews on `/` and `/docs/nodes` still render on the
client after hydration.

SPA fallback: `/app`, `/projects`, `/reset-password`, `/showcase`, `/examples`
(redirect), `/docs/style-guide`, `/docs/reference/:nodeId`, and unknown paths.

Deferred candidates: `/docs/reference/:nodeId` (a finite node set that could be
enumerated later) and `/showcase` (its wall loads projects at runtime, so only a
static shell could be prerendered).

How it is wired (#241):

- `apps/web/react-router.config.ts` reads `delivery.prerender` from
  `route-loading-contract.json`, so the contract is the only list of
  prerendered paths. `ssr` stays `false`; there is no runtime SSR service.
- `react-router build` writes `build/client/index.html` and
  `build/client/<path>/index.html` for each prerendered path, plus
  `build/client/__spa-fallback.html` for everything else.
- The SPA fallback document contains the root `HydrateFallback`: the Artifact
  mark and a `role="status"` loading label. It fades in after a short delay so
  fast loads never flash it, and holds still for reduced motion.
- `vercel.json` rewrites each prerendered path to its `index.html` and every
  other path to `/__spa-fallback.html`; static files win before rewrites.
  `vite preview` mirrors this through the `artifact-static-host-preview` plugin
  in `apps/web/vite.config.ts`, so production-preview browser tests see the same
  routing. `scripts/deploy/deployment-config.test.mjs` keeps `vercel.json` in
  step with the contract.
- Each route's `meta` comes from `pageMeta()` (`apps/web/app/utils/pageMeta.ts`),
  which sets the title, description, `og:title`, `og:description`, `og:url`,
  and Twitter title/description together. Static share fields (image, card
  type) stay in the root document head.
- Browser-only work stays out of build-time rendering: renderer, PixiJS, auth
  session, storage, and service-worker registration run in effects or lazy
  imports, never during render.
- Unknown paths hydrate the fallback markup first and then show the 404
  recovery page, so the root `ErrorBoundary` never causes a hydration mismatch.
- The root marks `<html data-hydrated="true">` once React owns the document.
  Browser tests wait for it after navigation, because prerendered controls are
  visible before they are interactive.

Evidence: `tests/browser/v049-prerender.spec.ts` (production preview) checks
the prerendered HTML and metadata, the fallback document, pages without
JavaScript, hydration without mismatch, the visible loading shell, client
navigation across prerendered and fallback routes, editor entry and refresh,
dynamic docs paths, and unknown-path recovery.

## Findings at v0.48.1

1. **React Flow shipped on every route.** The manual `codeSplitting` groups in
   `apps/web/vite.config.ts` put the `react` package inside `flow-vendor`, so
   `entry.client` imported React Flow everywhere. Resolved in #242: the manual
   groups are removed and React Flow loads only with the node canvas and the
   style guide.
2. **Framer Motion shipped on every route** because the shared `SiteNav`
   imported it. Resolved in #239: `SiteNav` uses CSS entrance animations that
   respect reduced motion.
3. **The home hero rendered through the full renderer at load**, requesting
   PixiJS during the first visit. Resolved in #242: `home.tsx` imports the
   renderer dynamically, so the renderer and PixiJS arrive after the first
   render.
4. **Global CSS holds every product surface.** `root.css` was 252 KiB raw
   (35.5 KiB gzip) and loaded on every route. Resolved in #240: `root.css` is
   45 KiB raw (9.1 KiB gzip) and surface styles load with their route; see
   [CSS ownership](#css-ownership).
5. **The root imported the document model for one constant.** Resolved in #239.
6. **No hydration fallback.** Production logged React Router's `HydrateFallback`
   hint and the SPA showed nothing useful until JavaScript ran. Resolved in
   #241: the root `HydrateFallback` renders an accessible loading shell into
   `__spa-fallback.html`, and the approved static public paths are prerendered
   with per-route metadata; see [Delivery](#delivery).
7. **Nodes and 3D are lazy** and stay that way.
8. **The style guide loads the node canvas** for its specimens. Owned exception.
9. **The Three.js chunk-size warning is not an initial-load problem.** Three.js
   loads only on 3D activation.
10. **Chunk names were misleading** (`flow-vendor` held React). Resolved in
    #242: rules now use source-map families; chunk names are not trusted.
11. **The service worker cache name is stale** (`artifact-v0.33.0-shell`) and
    precaches only `/` and `/app`. Recorded for the later offline work.
