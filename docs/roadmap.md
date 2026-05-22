# Artifact Codebase Overview and Roadmap

For the step-by-step implementation plan, see [`improvement-plan.md`](./improvement-plan.md).

Related architecture docs:

- [`state-model.md`](./state-model.md)
- [`rendering.md`](./rendering.md)
- [`node-editor.md`](./node-editor.md)
- [`app-structure-guidelines.md`](./app-structure-guidelines.md)
- [`effect-development.md`](./effect-development.md)
- [`testing.md`](./testing.md)
- [`improvement-plan.md`](./improvement-plan.md)
- [`production-readiness.md`](./production-readiness.md)
- [`monorepo-turborepo-container-plan.md`](./monorepo-turborepo-container-plan.md)

## Product summary

Artifact is a browser-based creative image/poster generator for indie musicians
and designers who want direct aesthetic control. It starts with album covers,
but the broader direction includes posters, music visuals, and eventually
portfolio or case-study pages for music/design projects. The product is
intentionally raw: warm dark UI, mono labels, square edges, seeded randomness,
layer composition, node editing, and export-ready artwork.

The core promise is simple: a user should be able to build a visual from layers
and nodes, preview it accurately, then export the same image at production
resolution and the selected aspect ratio.

Layers and nodes have different jobs:

- **Layers** are for fast work: quick stacking, reordering, visibility, simple
  edits, and rapid composition.
- **Nodes** are for advanced work: branching, merges, source/effect chains,
  reusable procedural structure, and explicit output control.

Both views must stay truthful. If nodes define a meaningful structure, the
layer view should respect that structure through folders, areas, or
graph-derived grouping instead of becoming a misleading flat stack.

The organization track now has serializable graph area metadata in
`CanvasGraph.areas`, node-canvas area overlays, and layer-panel folder rows.
Areas are organizational only for now; they do not change render order or
traversal until a dedicated render behavior is designed.

## Feature Intake From Sticky Notes

The sticky-note backlog is useful, but it should not all enter the current
release. Treat it as product discovery and split it by implementation surface.

### Editor Features

These can mostly stay browser-only and fit the current architecture:

- Layer folders/groups and graph areas for organizing dense stacks and advanced
  node graphs.
- Layer view that can respect node graph structure instead of only showing a
  flat stack.
- Low-resolution / pixelate whole-image node that respects the current aspect
  ratio and export scale.
- More procedural texture/noise nodes with presets.
- More primitive shapes, SVG-like primitives, and 3D sketch primitives.
- More focused effect nodes and shader-style effects with stronger controls.
- Font import, improved font browsing, and possible external font catalog
  support.
- Better text workflow, including typography presets, multi-font work, and text
  effect chains.
- Better drag/repositioning UX for canvas content.
- Image background removal workflow for uploaded images, with a future research
  pass comparing browser-side models, server-side/VPS processing, external APIs,
  and hybrid approaches.
- Dark/light theme mode.
- Improved empty-canvas onboarding.
- Downloadable project packages with a custom extension for local ownership,
  offline work, backup, and eventual PWA file handling.
- Voice/music visualizer node using browser audio input or uploaded audio.
- Physics/animation-style effects where the final export remains deterministic.
- Improved localization/i18n structure.

### Content And Learning

These make the product easier to understand and market:

- Better user-facing node/effect documentation.
- Example projects and tutorial presets.
- Mood/style preset folders.
- Procedural texture preset folders.
- Project/case-study pages for the Artifact portfolio.
- Showcase pages explaining how covers were made.

### Platform / Full-Stack Candidates

These likely need a VPS/backend, database, object storage, auth, or billing:

- Accounts.
- CI-built container images for VPS/Coolify deploys: build and tag service
  images in GitHub PR/CI, push them to a registry, then make the VPS deploy pull
  already-built images instead of running long multi-service Docker builds on
  the deploy host. The concrete target is GHCR images for `artifact-api`,
  `artifact-worker`, and `artifact-bull-board`, deployed in Coolify by immutable
  `sha-<shortsha>` tags or digests with `latest` disabled.
- Monorepo/Turborepo infrastructure migration for workspace-aware validation,
  shared API contracts, dedicated backend containers, and pull-only Coolify/VPS
  deploys. Detailed plan:
  [`monorepo-turborepo-container-plan.md`](./monorepo-turborepo-container-plan.md).
- Server-side project saving.
- Server-backed share links.
- Preset database and community preset browsing.
- User galleries or portfolio pages.
- Subscription/paywall experiments.
- AI image generation node or workflow, including prompt presets, variants,
  generated asset storage, quota/cost tracking, and generation history.
- Image background removal service if browser-side quality, bundle size, or
  performance tradeoffs are not acceptable.
- Server-side asset storage for large uploads.
- Team/project collaboration.
- Portfolio/case-study publishing.

Near-term rule: ship a reliable local editor first. Full-stack work becomes
much cheaper after the document schema, asset strategy, and export behavior are
stable.

## Current architecture

### Application shell

| Area | Main files | Notes |
| --- | --- | --- |
| Routing | `apps/web/app/routes.ts`, `apps/web/app/routes/*.tsx` | React Router v7 in SPA mode, `ssr: false`. |
| Main generator | `apps/web/app/routes/generator.tsx` | Switches between layer view and node view. Owns high-level UI composition. |
| Document state | `apps/web/app/hooks/useGeneratorDocument.ts` | Canonical `CanvasDocument`, selection, undo/redo, localStorage persistence, graph mutations, document import/export. |
| Asset state | `apps/web/app/hooks/useGeneratorAssets.ts`, `apps/web/app/utils/assetStore.ts` | Image upload/drop handling, IndexedDB asset payloads, and decoded `imageCache`. |
| Export | `apps/web/app/hooks/useGeneratorExport.ts`, `apps/web/app/utils/exportCanvas.ts` | Uses `renderDocument` with live primitive camera overrides. |
| Presets | `apps/web/app/hooks/usePresets.ts`, `apps/web/app/components/PresetsPanel.tsx` | localStorage-backed presets with thumbnails. |
| Projects | `apps/web/app/hooks/useProjects.ts`, `apps/web/app/utils/projectStore.ts` | IndexedDB-backed local project snapshots and pre-blank recovery drafts. |

### Data model

The canonical document type is `CanvasDocument` in
`apps/web/app/types/config.ts`.

```ts
interface CanvasDocument {
  schemaVersion?: number;
  global: GlobalConfig;
  layers: Layer[];
  graph?: CanvasGraph;
  export: ExportConfig;
}

interface CanvasGraph {
  edges: GraphEdge[];
  positions: Record<string, { x: number; y: number }>;
  mergeNodes: GraphMergeNode[];
  colorNodes: GraphColorNode[];
  repeatNodes?: GraphRepeatNode[];
  areas?: GraphArea[];
  primitiveViewStates?: Record<string, PrimitiveViewportStateConfig>;
}
```

Layer kinds are:

- `text`
- `image`
- `emoji`
- `fill`
- `effect`
- `primitive`
- `noise`
- `array`

The layer stack remains the portable document model. The node graph is an
optional editing/composition layer on top of the same document. Graph-only
merge, color, repeat, export, and area metadata are still serializable document
state, not a second editor format.

### Rendering pipeline

Rendering is exposed through `apps/web/app/utils/renderer.ts`. That file is the
public facade; implementation internals live under `apps/web/app/utils/render/`.

1. `renderDocument` decides whether to use stack mode or graph mode.
2. `renderGraphTarget` walks graph dependencies and renders each node.
3. Stack mode infers a linear graph from `doc.layers` so stack and graph
   rendering share semantics.
4. `applyLayerToCanvas` draws one layer/source/effect over an input canvas.
5. Canvas 2D handles text, image, fills, emojis, procedural sources, and some
   effect passes.
6. PixiJS handles GPU effect filters, with adjacent GPU-only effect nodes
   batched where semantics allow.
7. CPU-only pixel effect kernels and procedural noise texture generation can
   run in dedicated Web Workers with main-thread fallbacks.
8. Three.js renders primitives through
   `apps/web/app/utils/primitiveRenderer.ts` using the shared scene recipe in
   `apps/web/app/utils/primitiveScene.ts`.

This is the most important invariant:

> Preview, thumbnail, gallery, and export should call the same render path with the same document, graph, images, and live primitive camera state.

### Node canvas

Node editing lives under `apps/web/app/components/node-canvas`.

| Area | Files | Current role |
| --- | --- | --- |
| Canvas shell | `NodeCanvas.tsx` | React Flow integration, context providers, graph events, gallery modal, and primitive camera hook wiring. |
| State machine | `machine.ts` | XState state for selection and overlays. |
| Node construction | `buildRFNodes.ts` | Converts `CanvasDocument + CanvasGraph` to React Flow nodes. |
| Node components | `nodes/NodeTypes.tsx`, `nodes/NodeShell.tsx` | Layer, merge, color, repeat, and output node renderers. |
| Previews | `thumbnails/NodeThumbnail.tsx`, `thumbnails/LayerPreviewSurface.tsx` | Cached async thumbnails plus interactive selected-node previews. |
| Inspectors | `inspector/*.tsx`, `panel/NodePropertiesPanel.tsx` | Node-side property controls. |
| Menus | `menus/*.tsx` | Pane and node context menus, including compact add menu. |
| Areas | `areas/*` | Passive graph-area overlays and area bounds helpers. |

The current direction is correct: node editing is a specialized UI over the same document and render model, not a separate editor format.

### Interaction state

There are currently three state tiers:

| Tier | Examples | Persistence |
| --- | --- | --- |
| Document state | Layers, effect parameters, graph edges, graph positions, repeat/color/merge nodes, graph areas, committed primitive camera states, export config | Saved in `CanvasDocument`. |
| Session/UI state | Selection, open panels, gallery view, active primitive camera drafts | In React state and context. |
| Gesture draft state | Text/image local transform drafts, active primitive drag state | Component-local refs/state, committed after gesture. |

This split is necessary. The current rule is to draft locally during hot
gestures, then commit deliberately so undo history and thumbnail invalidation
track creative decisions rather than pointer ticks.

## What is good

### Strong product identity

`PRODUCT.md` and `DESIGN.md` are unusually specific. The app has a clear audience, mood, and visual vocabulary: warm dark neutrals, mono UI, square controls, rare accent use, and a raw zine-like tone. This makes design decisions easier.

### Canonical document model

`CanvasDocument` is a good core. It is serializable, localStorage-friendly, export-friendly, and already supports both stack and graph modes. Keeping the document portable is one of the healthiest parts of the codebase.

### Shared rendering path

The app generally uses `renderDocument` and `renderGraphTarget` across preview, thumbnails, examples, and export. That is the right architecture for "what you see is what you export."

### Layer factories and migration helpers

Factory functions in `config.ts` reduce malformed layer creation. `normalizeDocument` and compatibility handling in `useGeneratorDocument.ts` keep old documents usable.

### Good low-level testing coverage for data and rendering logic

Existing tests cover:

- config defaults and layer creation
- random document generation
- node graph helpers
- node canvas reducer/helpers
- document persistence and command helpers
- render fixtures for deterministic Canvas 2D paths and graph traversal
- thumbnail render signatures and scoped invalidation

These tests protect the model and renderer boundary from regressions.

### Node canvas direction is promising

Using React Flow for graph mechanics and XState for selection/overlay state is a good fit. The node add menu has moved toward a compact, direct, Blender-like interaction model, which matches the product.

## What is bad or risky

### `generator.tsx` is still broad

`generator.tsx` wires document state, asset state, projects, export, presets,
layout mode, preview, sidebar, and node mode. `NodeCanvas.tsx` has been split
into focused hooks for selection sync, context menus, graph events, drag state,
gallery state, and primitive camera state, but the route-level composition is
still dense.

This makes route-level behavior harder to scan and is the next likely place to
extract controller-style hooks when feature work touches multiple panels.

### Hot text/image canvas handles remain a known risk

The node editor has draft-state patterns for selected text/image node previews,
primitive camera movement, and React Flow node dragging. The classic
`CanvasHandles` path still commits text/image transform movement through
document updates during pointer moves, which can create extra history,
thumbnail, or render work.

The direction remains: draft locally, commit once per gesture, invalidate only
affected render paths.

### Visual regression coverage is still limited

The repo has deterministic render fixtures and focused browser smoke tests, but
no broad visual snapshot suite yet. GPU/PixiJS and Three.js output still need a
tolerance strategy before visual snapshots become useful.

### Persistence is local-first

Imported images, local projects, and recovery drafts now use IndexedDB, and
`.artifact.json` files/share links hydrate local image assets when possible.
This is enough for the local editor, but there should be a stronger data
ownership path: a downloadable project package with a custom extension that can
bundle the document, assets, thumbnails/previews, and metadata for offline
storage and re-open. That package should remain compatible with PWA file
handling where supported. Server-backed sharing, accounts, and large portable
asset packages remain out of scope until a dedicated persistence plan exists.

### CSS is a large monolith

`node-canvas.css` contains the full node editor UI. It is coherent visually,
but it is becoming hard to reason about. Component boundaries are not reflected
in style boundaries.

### Documentation must stay aligned

The architecture docs are much closer to the code now, but user-facing docs
still need to become more task-oriented: first cover, layer workflow, nodes,
effects, sources, repeaters, projects, export, and troubleshooting.


## Improvement principles

1. **Single source of truth per concern.** Document state, graph state, camera state, and gesture state should each have a named owner.
2. **Draft locally, commit deliberately.** High-frequency gestures should not write to `CanvasDocument` every frame.
3. **Render parity is a feature.** Preview/export equality should be tested, not assumed.
4. **Node controls belong inside nodes when they manipulate node-local view state.** Side panels should edit durable document parameters, not transient camera state.
5. **The renderer should be modular but shared.** Split code for clarity without creating separate preview/export implementations.
6. **Docs should track architecture.** Any major UI/rendering invariant should be documented near the code and in product docs.

## Roadmap

### Current release line

The active release target is `v0.13.0-alpha.1`, a private AI generation alpha.
Earlier `v0.2` through `v0.12` roadmap headings are release history, not active
target buckets. Any unfinished work from those sections has been moved below
into future versions.

Current shipped baseline:

- Local-first document editing with stack and graph workflows.
- Graph nodes for layer, merge, color, repeat, and export composition.
- Graph areas as serializable organization metadata with node overlays and
  layer-panel folder rows.
- Focused effect presets, procedural noise/array sources, repeater presets, and
  per-node seed offsets.
- Blank-canvas entry points and first starter paths.
- Local project snapshots, imported image assets, and recovery drafts in
  IndexedDB.
- `.artifact.json` import/export and hydrated share-link behavior where local
  assets are available.
- Private AI Image alpha workflow with Clerk-gated access, VPS API/worker,
  Postgres, Redis/BullMQ, generated asset storage, quota guards, retries,
  diagnostics, and local asset import.
- Future local project package direction: custom-extension downloads that keep
  the user's document and assets portable outside browser storage.
- Shared renderer facade, split renderer internals, render fixtures, browser
  smoke tests, thumbnail signatures, and node-editor performance tooling.

### v0.11: Layer Workflow And Onboarding

Detailed plan: [`version-plans/v0.11.md`](./version-plans/v0.11.md).

Goal: make layer mode feel like the fastest path to a finished cover while
keeping node workflows truthful.

- [ ] Improve the layer list hierarchy for graph-area documents so areas read
  like lightweight folders without changing render order.
- [ ] Add layer-row affordances for duplicate, mute, rename, delete, and quick
  add where they are faster than opening the node canvas.
- [ ] Add clearer layer empty states and quick-start actions for image, text,
  fill, noise, and effect starts.
- [ ] Add layer presets or recipes that create useful stacks without opening
  nodes.
- [ ] Ensure layer controls explain unavailable or node-owned controls instead
  of silently hiding them.
- [ ] Keep layer preview and export parity visible and trustworthy for stack
  workflows.
- [ ] Add a sectioned onboarding guide for canvas, layers, nodes, sources,
  effects, repeaters, export, projects, and examples.
- [ ] Add a "what changed" or "open guide" path for first visits after a new
  beta release.
- [ ] Keep destructive starts guarded by confirmation and recovery drafts.

Exit criteria:

- A user can build and export a credible stack-only cover without opening nodes.
- Layer mode does not contradict graph organization when a document uses areas.
- New users can choose between blank, image, text, example, recipe, and random
  starts without needing hidden knowledge.

### v0.12: Examples, Recipes, And Effect Coverage

Detailed plan: [`version-plans/v0.12.md`](./version-plans/v0.12.md).

Goal: turn the current power features into learnable, regression-tested
workflows.

- [x] Add recipe starter documents that create useful first graphs.
- [x] Add recipe starter documents for common covers: photo plus type, noisy
  texture plus type, sticker/grid motif, primitive over image, and print-damage
  poster.
- [x] Improve examples with categories, used-node summaries, and clearer "start
  from this" language.
- [x] Improve add-node search and grouping for recipes and starter workflows.
- [x] Split user-facing docs into task pages or sections: first cover, layers
  workflow, nodes workflow, effects, sources, repeaters, export, and projects.
- [x] Explain blend modes with practical examples and when to use each one.
- [x] Add layer-vs-node guidance with examples of when to stay in layers and
  when to switch to nodes.
- [x] Add effect-family recipes that stay aligned with separated focused effect
  nodes.
- [x] Add troubleshooting guidance for blank previews, missing image assets,
  browser storage limits, GPU/WebGL quirks, and export mismatch.
- [x] Audit grain/noise, scanlines, rays, speed lines, halftone, barcode arrays,
  and threshold for range problems found in real projects.
- [x] Revisit effect-node controls after real project testing, starting with
  film grain scale/size so it can be tuned subtly.
- [x] Evaluate splitting Cells out of the generic Noise source into a dedicated
  procedural source node if it keeps needing different controls from value and
  cloud noise.
- [x] Keep docs examples aligned with separated focused effect nodes.
- [x] Add render or browser coverage for every effect/source control whose range
  changes.
- [x] Add browser smoke coverage for at least one layer-first starter path and
  one docs "try this" path.

Exit criteria:

- Examples teach the feature they demonstrate.
- Docs explain workflows with recipes, not only parameter lists.
- Changed effect/source ranges have focused test coverage.

### v0.13: AI Generation Research And Architecture

Detailed plan: [`version-plans/v0.13.md`](./version-plans/v0.13.md).

Goal: make AI-generated imagery a creativity multiplier without weakening the
editor's local-first reliability or leaking provider secrets into the browser.

Product direction:

- Image Generation node: prompt/settings in, generated image asset out, then
  normal Artifact effects/merge/export downstream.
- Variation workflow: generate alternatives from an existing image or rendered
  branch so users can rapidly explore cover directions.
- Background/texture generator: create grunge, photo, abstract, scanned-paper,
  poster-background, and mood-board source assets.
- Prompt preset packs for music/design aesthetics such as VHS, brutalist,
  shoegaze, dark ambient, cyber zine, club poster, and scanned print.
- Generation history with reusable outputs, seed/settings metadata where the
  provider supports it, and side-by-side comparison.

Research and architecture tasks:

- [ ] Compare generation providers and models for quality, latency, cost,
  licensing, safety constraints, and API ergonomics.
- [ ] Design a backend endpoint that keeps API keys server-side and can support
  cancellation, retry, progress, and error states.
- [ ] Decide where generated images live: browser IndexedDB only, VPS/object
  storage, or hybrid local-first storage with optional cloud sync.
- [ ] Define quota/cost accounting before broad usage. Even a beta needs a
  clear limit so generation does not become a surprise bill.
- [x] Define how generated assets serialize in `.artifact.json` and shared
  projects: completed outputs import into normal local image assets, and
  save/share hydrates available local bytes into portable data URLs.
- [ ] Prototype a minimal Image Generation node only after the storage and
  generation-job model are clear.
- [ ] Add a deploy hardening pass for VPS services: build API/worker/Bull Board
  containers in GitHub PR/CI, publish immutable image tags, and configure the
  VPS/Coolify deploy step to run those images instead of rebuilding on the VPS.
  This should reduce preview deploy timeouts and make deploy failures separate
  from image build failures. The GHCR/Coolify plan now covers image references,
  required `packages: write` publishing permission, read-only Coolify package
  pulls, shared API/worker/BullMQ/Postgres/storage env, migration-before-deploy
  order, and rollback by previous tag or digest.
- [ ] Run the monorepo/Turborepo migration as a dedicated infrastructure track:
  introduce workspaces, add Turborepo task orchestration, move the web app into
  `apps/web`, extract stable shared contracts, build dedicated service
  containers, publish images from GitHub PR/CI, and switch Coolify/VPS to
  pull-only deploys. Plan:
  [`monorepo-turborepo-container-plan.md`](./monorepo-turborepo-container-plan.md).
  Initial foundation is in progress: API workspace wiring, web workspace
  relocation, shared AI contracts, API/web/shared Turbo scripts, production API
  build/start scripts, service Dockerfiles, and the additive GHCR image
  workflow are implemented.

Release checklist:

- [x] Commit the current AI Image node reliability batch: generated variant
  history, loading/failure states, React Flow measurement stability, and local
  asset preview fixes. Focused browser coverage now includes multiple AI image
  generations in the same node across reload, history traversal, and completed
  jobs whose asset import fails.
- [x] Fix Vercel preview deploy drift after the workspace move: the repo build
  stays React Router, while Vercel is explicitly configured as a static Vite
  output deploy for `apps/web/build/client`; the accidental extra Vercel
  project created during local CLI validation was removed.
- [x] Run private-alpha QA against the local VPS-shaped stack with real API,
  Postgres, Redis, worker, BullMQ, Bull Board, and local file storage. Manual
  private-alpha QA on 2026-05-22 covered the required AI Image flow and found
  no current alpha-blocking issues.
- [x] Add explicit AI Image retry/recovery actions and compact job/asset
  diagnostics in the AI Image panels. Failed generations expose retry, asset
  import failures expose recovery from the durable job id, and compact
  status/job/asset/error/provider metadata is visible without opening logs.
- [x] Add generated-job and generated-asset cleanup operations plus runbook
  notes.
- [x] Write v0.13 release notes and accepted-risk checklist before tagging.

Private-alpha merge gate:

- [x] Merge blocker: reliability batch is committed and the full local
  validation suite passes. Validation passed on 2026-05-22 with
  `npm run check`, `npm run build`, `npm run build:api`, and focused
  AI Image Playwright coverage.
- [x] Merge blocker: real local stack QA passes for Clerk login, AI-enabled
  account access, quota display, first generation, multiple generations in one
  AI Image node, history traversal, reload, export, provider failure, failed
  asset import, and quota exhaustion.
- [x] Merge blocker: alpha-blocking bugs found in QA are fixed or documented
  with an accepted workaround that does not risk token spend, export failure,
  or document corruption.
- [x] Merge blocker: minimal retry/recovery and compact job diagnostics exist
  so a failed generation can be understood without immediately opening logs.
- [ ] Post-merge follow-up: provider/defaults research and prebuilt container
  deploys can land after the private alpha merge if the blockers above pass.
- [ ] Post-merge follow-up: harden AI accounting before broader beta access.
  Current private-alpha safeguards are acceptable because the database enforces
  one active generation per user, queue enqueue failures refund quota, and the
  active-job migration self-expires old duplicate active rows before creating
  the guard index. Before increasing concurrency or opening access beyond the
  private alpha, move quota consumption into an atomic database operation and
  make concurrent same-idempotency-key requests return the existing job instead
  of occasionally surfacing `active_job_exists`.
- [ ] Post-merge follow-up: monorepo/Turborepo workspace migration can be done
  in parallel tracks after the private alpha merge decision, following
  [`monorepo-turborepo-container-plan.md`](./monorepo-turborepo-container-plan.md).

Estimated effort before deciding whether to merge: 2 focused days in the best
case, 3 focused days expected, and 4 focused days if auth/session, asset import,
or worker-state edge cases need another pass.

### Experimental Track

These ideas are promising but should not block editor reliability:

- Voice/music visualizer nodes using uploaded audio or microphone input.
- Animated noise/effects and possibly video export.
- Background removal for imported images. Research candidates first, including
  local/browser execution, VPS-hosted open models, and commercial APIs, then pick
  based on quality, latency, privacy, file-size, and cost.
- SVG + 3D hybrid primitives.
- AI image/card generation nodes and variant workflows.
- 3D layer visualization.
- Subscription/paywall experiments.

## Historical phase plan

The older phase-by-phase architecture plan has been retired from this roadmap.
Completed and remaining implementation details now live in
[`docs/improvement-plan.md`](./improvement-plan.md), with testing specifics in
[`docs/testing.md`](./testing.md) and performance specifics in
[`docs/performance.md`](./performance.md).

## Recommended near-term focus

The next product pass should focus on v0.11: layer workflow and onboarding.
The node editor is now powerful and fast enough for advanced work, but new
users still need a clearer path into the product, and layer mode should again
feel like the fastest way to make a cover.

Recommended order:

1. Improve the layer list around graph areas so it reads like lightweight
   folders without changing render order.
2. Add layer-row quick actions and clearer empty states.
3. Add one or two layer-first recipe documents and use them from examples/docs.
4. Add practical docs for layers vs nodes, blend modes, effects, sources,
   repeaters, export, and troubleshooting.
5. Add browser smoke coverage for starter flows and docs "try this" actions.
6. Keep AI generation as the next major creative research track after v0.12.

## Non-goals for now

- Do not add backend persistence until the local document schema and asset strategy are stable.
- Do not add AI generation before the v0.11/v0.12 learning and layer-mode pass
  is usable.
- Do not add more effect parameters until the effect update checklist is automated or tested.
- Do not make a second preview renderer for speed unless it is clearly labeled as draft-only.
- Do not duplicate node controls in both sidebar and inspector without shared field definitions.

## Health summary

The codebase is productive and has a strong core: portable documents,
deterministic Canvas render fixtures, GPU effects, node graph editing, local
asset/project persistence, and a clear visual identity. The main weakness is no
longer missing architecture documentation; it is product legibility and
remaining edge coverage.

The best path forward is to keep the architecture stable while making the app
easier to enter: improve layer-first workflows, make docs task-oriented, keep
one rendering truth, and add focused browser/visual coverage where regressions
are most likely.
