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
| Home, before render | `/` | public | prerender | 423.6 | 130.3 | 170 |
| Home, after render (hero) | `/` | home route | — | (in v0.48.1 initial) | +179.8 | +185 |
| Docs | `/docs` | public | prerender | 240.4 | 118.5 | 170 |
| Account recovery | `/reset-password` | public | SPA fallback | 239.6 | 118.8 | 170 |
| Projects | `/projects` | account | SPA fallback | 312.8 | 217.9 | 230 |
| Editor, blank Layers | `/app` | editor | SPA fallback | 414.4 | 320.8 | 370 |
| Nodes activation | Nodes tab | NodeCanvas | — | +65.4 | +119.4 | +135 |
| Style guide | `/docs/style-guide` | public | SPA fallback | 402.4 | 361.5 | 370 |
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

CSS budgets (home, docs, recovery 24; Projects 26; editor 50; style guide 65;
Nodes activation +20; 3D +5) are recorded in the contract but not enforced until
#240 splits the global stylesheet by route owner; that issue turns on
`enforcement.cssBudgets`. Current CSS: 35.6 KiB on public routes, 38.7 on
Projects, 41.8 in the editor, 60.0 on the style guide.

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
4. **Global CSS holds every product surface.** `root.css` is 252 KiB raw
   (35.5 KiB gzip) and loads on every route. Owner: #240.
5. **The root imported the document model for one constant.** Resolved in #239.
6. **No hydration fallback.** Production logs React Router's `HydrateFallback`
   hint; the SPA shows nothing useful until JavaScript runs. Owner: #241.
7. **Nodes and 3D are lazy** and stay that way.
8. **The style guide loads the node canvas** for its specimens. Owned exception.
9. **The Three.js chunk-size warning is not an initial-load problem.** Three.js
   loads only on 3D activation.
10. **Chunk names were misleading** (`flow-vendor` held React). Resolved in
    #242: rules now use source-map families; chunk names are not trusted.
11. **The service worker cache name is stale** (`artifact-v0.33.0-shell`) and
    precaches only `/` and `/app`. Recorded for the later offline work.
