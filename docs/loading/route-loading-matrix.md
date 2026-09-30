# Route Loading Matrix

Normative loading contract for
[v0.49 Application Shell And Loading Boundaries](../version-plans/v0.49.md)
(issue #238). The machine-readable contract is
[`route-loading-contract.json`](./route-loading-contract.json); the measured
baseline is [`route-loading-baseline.json`](./route-loading-baseline.json).

## Reproducing the baseline

```bash
npm run build
npm run loading:baseline
```

`scripts/loading/route-loading-baseline.mjs` reads the React Router route
manifest from `apps/web/build/client`, then serves that build with
`vite preview` (SPA fallback, like the production rewrite) and records every
same-origin JS and CSS request in Chromium with the service worker blocked, so
each state is a first visit. Asset names are stored without content hashes and
sizes are gzip level 9 of the built file, so two runs over the same source
produce identical output. `npm run test:loading` checks that the contract covers
every state and agrees with the checked-in baseline.

## Matrix

Sizes are gzip KiB. Baseline is v0.48.1; budget is the v0.49 exit target.

| State | URL | Owning shell | Delivery | Baseline JS / CSS | Budget JS / CSS |
| --- | --- | --- | --- | --- | --- |
| Home | `/` | public | prerender | 423.6 / 38.4 | 170 / 24 |
| Home hero activation | `/` after first paint | home route | — | (included above) | +185 / +0 |
| Docs | `/docs` | public | prerender | 240.4 / 38.4 | 170 / 24 |
| Account recovery | `/reset-password` | public | SPA fallback | 239.6 / 38.4 | 170 / 24 |
| Projects | `/projects` | account | SPA fallback | 312.8 / 41.1 | 230 / 26 |
| Editor, blank Layers | `/app` | editor | SPA fallback | 414.4 / 44.2 | 370 / 50 |
| Editor, Nodes activation | Nodes tab | NodeCanvas | — | +65.4 / +12.8 | +135 / +20 |
| Style guide | `/docs/style-guide` | public | SPA fallback | 402.4 / 60.4 | 360 / 65 |
| First 3D activation | add Primitive layer | primitive scene renderer | — | +206.7 / +0 | +215 / +5 |

Allowed initial chunks are named groups plus each route's own module:

| Group | Chunks | Used by |
| --- | --- | --- |
| framework | `entry.client`, `rolldown-runtime`, `manifest`, `root` | every state |
| publicShell | `SiteNav`, `PublicPageLayout`, `ProductPageHeader`, `authClient`, `apiBaseUrl`, `appBuildInfo`, `dialog`, `fields`, `feedback`, `utils` | every state |
| projectData | `apiClient`, `useProjects`, `assetStore`, `modelAssetStore`, `generateThumbnail`, `effectLayerMigration`, `EmptyState`, `config` | projects, editor, style guide |
| editorCore | editor `tabs` chunk, `SearchField`, `constants`, `noisePresets`, `randomConfig`, `starterDocuments`, `useAddLibraryMobileSheet`, `PrimitiveViewportState`, `renderer`, Framer Motion | editor, style guide |

No initial load may request `three-vendor.js`, `node-canvas.js`,
`primitiveScene.js`, or `primitiveRenderer.js`. `npm run test:loading` fails if a
chunk measured on an initial load is neither allowed, prohibited, nor an owned
exception, so a new eager dependency has to be classified here.

| State | Prohibited on initial load | Owned exceptions |
| --- | --- | --- |
| Home | React Flow, PixiJS and its helpers, renderer, `effectLayerMigration.js`, `config.js`, editor `tabs.js` | Framer Motion: the home route animates its own sections |
| Docs, account recovery | React Flow, PixiJS, renderer, Framer Motion, `config.js`, editor `tabs.js` | — |
| Projects | React Flow, PixiJS, Framer Motion, editor `tabs.js` | renderer: project thumbnails |
| Editor, blank Layers | React Flow, PixiJS | PixiJS once the open document needs the WebGL pass |
| Style guide | PixiJS, Three.js | node-canvas and React Flow: live node-canvas specimens |

Activation-only dependencies:

- **Home hero**: renderer, PixiJS, `pixiFilters.js`, `gpuRender.js`,
  `effectLayerMigration.js`, and the pixel-transform worker, requested after the
  first paint.
- **Nodes**: `flow-vendor.js` and the `node-canvas` chunks.
- **3D**: `three-vendor.js`, `primitiveScene.js`, `primitiveRenderer.js`, and
  `canvasRendering.js`.

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

1. **React Flow ships on every route.** The manual `codeSplitting` groups in
   `apps/web/vite.config.ts` put the `react` package inside `flow-vendor`, so
   `entry.client` imports `flow-vendor.js` (58.0 KiB) and `flow-vendor.css`
   (2.5 KiB) everywhere, although the node canvas itself is lazy. Owner: #242.
2. **Framer Motion ships on every route** (39.2 KiB) because the shared
   `SiteNav` imports it. Home and the editor also import it directly.
   Owner: #239.
3. **The home hero renders through the full renderer at load.** `home.tsx`
   statically imports `renderer.js` (35.3 KiB), which then requests PixiJS
   (134.4 KiB) during the first visit. Owner: #242.
4. **Global CSS holds every product surface.** `root.css` is 252 KiB raw
   (35.5 KiB gzip). `app/index.css` alone is 200 KB of source and includes docs,
   layers, Add Library, home, projects, editor, AI, and account rules, all loaded
   on every route. Owner: #240.
5. **The root imports the document model for one constant.** `root.tsx` imports
   `GOOGLE_FONT_STYLESHEET_URL` from `types/config.ts`, pulling a 7.5 KiB
   `config.js` chunk into every route. Owner: #239.
6. **No hydration fallback.** Production logs React Router's
   `HydrateFallback` hint; the SPA shows nothing useful until JavaScript runs.
   Owner: #241.
7. **Nodes and 3D are already lazy.** `node-canvas` and `three-vendor` load only
   on activation and must stay that way.
8. **The style guide imports node-canvas statically** for its specimens. This is
   an owned exception, not a defect.
9. **The Three.js chunk-size warning is not an initial-load problem.**
   `three-vendor.js` (about 800 KB raw) loads only on 3D activation, so the build
   warning alone does not justify work.
10. **Chunk names are misleading.** The 59 KiB editor chunk is named `tabs.js`
    after one shared UI module, and `flow-vendor` contains React. Owner: #242.
11. **The service worker cache name is stale** (`artifact-v0.33.0-shell`) and
    precaches only `/` and `/app`. It does not affect first-visit loading; it is
    recorded here for the later offline work.
