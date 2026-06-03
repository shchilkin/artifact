# AGENTS.md

## Read this first

Before changing state ownership, rendering, node editor behavior, thumbnails,
preview/export parity, persistence, performance-sensitive render work, or 3D
primitive controls, read the current docs:

- `docs/state-model.md` — state ownership, persistence, undo, export impact,
  thumbnail invalidation, image assets, and project storage.
- `docs/rendering.md` — canonical render entry points, stack vs graph mode,
  primitive rendering, thumbnails, graph caches, and parity checklist.
- `docs/node-editor.md` — node editor architecture, interaction grammar, event
  isolation, graph areas, context-menu rules, and QA checklist.
- `docs/effect-development.md` — effect-control surfaces, metadata, renderer,
  docs, and validation checklist.
- `docs/app-structure-guidelines.md` — feature-folder structure, component
  boundaries, variant rules, and preview/export invariants.
- `docs/testing.md` — current unit, render, graph, browser, performance, and CI
  coverage.
- `docs/performance.md` — node-editor benchmark workflow, render marks,
  thumbnail queue behavior, worker boundaries, and profiling notes.
- `docs/improvement-plan.md` — ordered implementation phases with exit
  criteria and validation.
- `docs/roadmap.md` — codebase overview, current strengths/risks, and product
  roadmap.
- `docs/version-plans/v0.11.md` — v0.11 layer workflow and onboarding scope,
  acceptance criteria, validation, and QA.
- `docs/version-plans/v0.12.md` — v0.12 examples, recipes, docs, and effect
  coverage scope, acceptance criteria, validation, and QA.
- `docs/production-readiness.md` — release gate, manual QA checklist, known
  risks, and feature intake split.
- `docs/agent-skills.md` — preferred Codex skill profile for this project,
  including design, React Router, React Flow, browser QA, GitHub, and security
  skill usage.

These docs are the source of truth for architecture work. If this file conflicts
with them, follow the docs and update this file.

## Preferred agent skills

Use the repo skill profile in `docs/agent-skills.md` when choosing among global
skills. In short:

- Prefer `impeccable` for UI critique, polish, visual hierarchy, product copy,
  and design quality gates.
- Use `react-router-framework-mode` for route modules, navigation, route config,
  typegen, and SPA/SSR React Router decisions.
- Use `react-flow` for node editor graph behavior and React Flow patterns.
- Use browser verification skills for local visual QA after meaningful frontend
  changes.
- Use `vercel:shadcn`, `vercel-composition-patterns`, and
  `vercel:react-best-practices` for shared UI primitives, component APIs, and
  React review.
- Use GitHub and Codex Security skills when PR publishing, CI, review comments,
  or security scans are in scope.

Do not use `frontend-design` as a default Artifact skill. Its installed copy
appears Anthropic-origin and overlaps with `impeccable`; prefer `impeccable`
unless the user explicitly asks to compare or invoke `frontend-design`.

## Version planning workflow

For roadmap work, do not infer acceptance criteria only from the issue or from
old roadmap headings. Read the active version plan first:

- v0.11 layer workflow/onboarding work: `docs/version-plans/v0.11.md`
- v0.12 examples/recipes/effect-coverage work: `docs/version-plans/v0.12.md`

When implementing a version-plan item:

1. Identify which acceptance criterion the change is closing.
2. Keep the scope inside that version unless the user explicitly asks to pull
   work forward.
3. Update the version plan and roadmap if scope, sequencing, or exit criteria
   changes.
4. Add the lowest useful tests before broad browser coverage.
5. Run the validation commands listed in the relevant version plan before
   calling the item done.

## Project scope

Artifact is a browser-only creative image/poster editor that starts with
album covers. It has a hybrid editing model:

- a canonical layered document (`CanvasDocument`)
- an optional node graph (`doc.graph`) for advanced graph-driven composition
- a React Flow canvas for editing graph structure
- a Canvas 2D + PixiJS + Three.js renderer for preview, thumbnails, gallery,
  presets, and export
- local browser persistence: active document state in localStorage, imported
  image payloads and local projects in IndexedDB

Treat it like a node-based application, but adapt advice to this codebase
instead of applying a generic DAG template. The product goal is that users can
work quickly in layers, build advanced workflows in nodes, and export the same
composition they previewed.

## Architecture stance: logic vs canvas

### 1. Graph engine

Keep graph rules, traversal, and validation centered in pure data and helpers:

- graph types and factories live in `apps/web/app/types/config.ts`
- graph helpers live in `apps/web/app/utils/nodeGraph.ts`
- graph rendering lives behind the public `apps/web/app/utils/renderer.ts` facade, with
  internals under `apps/web/app/utils/render/`
- React Flow adapters such as node/edge shape mapping belong under
  `apps/web/app/components/node-canvas/*`

Key graph behaviors include edge insertion, edge splitting, upstream/downstream
traversal, render-order resolution, layout, connected-port detection, cycle
prevention, repeat nodes, and graph areas. Do not push UI concerns into
`apps/web/app/utils/nodeGraph.ts`.

### 2. State/document sync

`apps/web/app/hooks/useGeneratorDocument.ts` is the bridge between graph edits, layer
edits, undo/redo, URL import, localStorage persistence, and `.artifact.json`
document import/export. Preserve this boundary:

- `CanvasDocument` is the serialized source of truth.
- Graph edits must stay compatible with history and persistence.
- State must remain serializable JSON.
- Durable document mutations should be expressed through
  `apps/web/app/utils/documentCommands.ts`, `apps/web/app/utils/documentHistory.ts`,
  `apps/web/app/utils/documentPersistence.ts`, and graph helpers where possible.
- Active local documents should contain lightweight image references, not large
  imported image payloads.

Never store DOM nodes, WebGL objects, Three.js cameras, Pixi objects, canvases,
`ImageBitmap`s, `HTMLImageElement`s, or other non-serializable data inside
`CanvasDocument`, `CanvasGraph`, layers, or graph node metadata. Caches belong
outside the document.

### 3. Renderer and UI

The UI should read and manipulate state, not define graph semantics:

- `apps/web/app/components/node-canvas/*` renders and edits the node editor.
- `apps/web/app/components/node-canvas/machine.ts` owns selection/overlay UI state via
  XState.
- `apps/web/app/components/node-canvas/hooks/*` owns node-canvas orchestration slices
  such as selection sync, context menus, graph events, drag state, gallery state,
  and primitive camera state.
- `apps/web/app/utils/renderer.ts` is the public rendering facade. App code should
  import `renderDocument`, `renderGraphTarget`, and renderer types from there
  unless it is working inside renderer internals.

Important current behavior:

- `renderDocument` uses `renderGraphTarget` internally for both graph documents
  and stack documents.
- When `doc.graph` exists and `graphMode` is not forced to `'stack'`,
  `renderDocument` renders the graph export target.
- Stack mode infers a linear graph from `doc.layers` so stack and graph paths
  share rendering semantics.
- `CanvasPreview` renders graph documents in graph mode and stack documents in
  stack mode.
- Node thumbnails and gallery previews render graph targets and may use an
  external transient `GraphRenderCache`.
- Export paths must render directly from the canonical renderer and receive the
  same live primitive camera state that the user previewed.

Do not accidentally make layer-first stack behavior depend on custom graph
edges unless that scope is explicit. When a surface needs classic layer-stack
behavior, pass `graphMode: 'stack'` deliberately.

## Architecture anchors

- `CanvasDocument = { schemaVersion?, global, layers, graph?, export }`
- `CanvasGraph = { edges, positions, mergeNodes, colorNodes, repeatNodes?,
  areas?, primitiveViewStates? }`
- Layer kinds are `text`, `image`, `emoji`, `fill`, `effect`, `primitive`,
  `noise`, and `array`.
- Graph nodes are layer-backed nodes plus graph-only merge, color, repeat, and
  export nodes.
- Graph areas/groups are serializable organization metadata. They must not
  change graph traversal or render order unless a dedicated render rule is
  designed and tested.
- Primitive camera state belongs in render options and persisted
  `CanvasGraph.primitiveViewStates`, not in `layer.tiltX`/`layer.tiltY`.
- Render order and dependency selection come from graph traversal helpers such
  as `resolveRenderOrder()`, `resolveUpstreamRenderLayers()`, and upstream
  collection helpers.
- Cycle checks currently use `wouldCreateCycle(...)`; this repo blocks invalid
  edges instead of throwing a dedicated cycle exception.

If you add a new graph node concept, update all relevant surfaces together:

1. graph types, defaults, factories, and migrations in `apps/web/app/types/config.ts`
2. graph helpers in `apps/web/app/utils/nodeGraph.ts`
3. document commands/sync in `apps/web/app/utils/documentCommands.ts` and
   `apps/web/app/hooks/useGeneratorDocument.ts`
4. React Flow node construction in `apps/web/app/components/node-canvas/buildRFNodes.ts`
5. node UI in `apps/web/app/components/node-canvas/nodes/*`
6. inspector/properties UI in `apps/web/app/components/node-canvas/inspector/*` and
   `apps/web/app/components/node-canvas/panel/NodePropertiesPanel.tsx`
7. graph-aware rendering, thumbnails, gallery, export, and render signatures
8. tests and docs

## Persistence and assets

- Active quick-reload document state still uses localStorage through
  `documentPersistence`, but imported images should be represented as
  `artifact-asset://...` references when possible.
- Imported image payloads live in IndexedDB via `apps/web/app/utils/assetStore.ts`.
- Local projects and the pre-blank recovery draft live in IndexedDB via
  `apps/web/app/utils/projectStore.ts`, with migration/fallback paths for older
  localStorage records.
- `.artifact.json` export and share-link creation should hydrate local asset
  references back to portable data URLs when possible.
- Decoded image caches and thumbnail/render caches must stay outside
  `CanvasDocument`.

## Rendering and performance

- Keep preview, thumbnails, gallery, presets, and export on the public renderer
  entry points unless an intentional draft-only shortcut is documented.
- Use `apps/web/app/components/node-canvas/thumbnails/previewSizing.ts` for
  thumbnail-like aspect sizing.
- Use `useDocumentRenderer` render scaling/downsampling for layer-preview
  quality improvements without changing pointer math.
- The main layer preview may render a draft frame first and defer the
  full-quality pass. Export, output thumbnails, and graph-target previews should
  request the quality they need directly.
- Transparent document backgrounds must stay transparent in render/export
  output. Checkerboards are UI chrome only.
- Graph render caches are transient render-session caches. They store canvases
  or promises outside the document and must be keyed by every pixel-affecting
  input.
- PixiJS GPU work is lazy-loaded and instrumented. Adjacent GPU-only effect
  nodes may batch into one GPU pass, but effects with masks, Canvas 2D drawing,
  or pixel-worker transforms stay on their explicit path.
- Dedicated Web Workers currently cover procedural noise texture generation and
  CPU-only image-data effect transforms. Keep worker boundaries pure:
  serializable config and transferable buffers in, serializable/transferable
  results out.

## Testing strategy blueprint

Use TypeScript by default. Prefer the lowest test layer that proves the
behavior.

### 1. Unit tests: pure logic first

Start with Vitest around pure helpers and machine/reducer logic.

Priorities:

- graph mutation helpers: `addGraphEdge`, `removeGraphEdge`,
  `splitEdgeWithNode`, add/remove/update merge, color, repeat, and area helpers
- traversal and ordering: `resolveRenderOrder`, `resolveUpstreamRenderLayers`,
  upstream/downstream collection, `organizeGraph`, and connected ports
- validation rules: `wouldCreateCycle` and any future port/type validation
- document commands, history update modes, normalization, URL import, and
  serialization-safe round trips
- XState/reducer/helper logic under `apps/web/app/components/node-canvas/*`
- thumbnail render signatures and invalidation boundaries
- pure worker kernels before browser worker wiring

Project-specific rule: when testing cycle handling, assert that
`wouldCreateCycle(...)` returns `true` and that the UI path rejects the
connection. Do not write tests that expect a `CycleDetectedError` unless the
implementation actually gains one.

### 2. Render and integration tests

Target state transitions and renderer behavior that cross file boundaries:

- `useGeneratorDocument` keeping `doc`, `doc.graph`, selection, and history in
  sync
- graph edits surviving undo/redo
- `normalizeDocument()` preserving compatibility for stored documents and
  `?doc=` imports
- localStorage/IndexedDB-safe serialization behavior
- graph-aware rendering choosing the correct traversal mode without mutating the
  document
- deterministic stack and graph render fixtures for Canvas 2D paths
- render signatures for layers, graph nodes, edges, image readiness, and
  primitive camera state

When a change affects both graph state and visible preview behavior, test the
state boundary first and the rendered result second.

### 3. Browser tests

This repo uses focused Playwright tests under `tests/browser/` for behavior that
Node/Vitest cannot prove. Keep this suite small and regression-driven.

Focus on:

- layer/node tab switching and nonblank preview regressions
- primitive WebGL camera controls
- export/download smoke coverage
- connecting ports by drag interaction when needed for regressions
- pan/zoom and selection behavior on the node canvas
- inserting merge/color/repeat nodes into existing edges
- exporting or previewing a simple graph-backed composition
- at least one layer-first starter path and one docs "try this" path as v0.8
  onboarding work grows

### 4. Visual regression

If visual snapshots are introduced, cover:

- edge alignment and handle positioning
- node canvas at multiple zoom levels
- parity between graph-target previews and final rendered output where intended
- GPU/PixiJS and Three.js output only after a tolerance strategy is defined

### 5. Performance and stress

Use `npm run perf:node-editor` when a change may affect node-editor
responsiveness. Watch for:

- large synthetic graphs exercising pure helpers before UI benchmarks
- dragging one node causing unnecessary re-renders across unrelated nodes
- control changes redrawing every passive thumbnail
- initial-load long tasks from image decode, GPU effects, or full-quality
  preview work
- stale heavy references after deleting graph sections

State should stay light and serializable; caches belong outside the document.

## Development strategy

### 1. Model first

Change the data model and pure graph/document logic before changing React Flow
components. If the rule cannot be expressed or tested without React, the
boundary is probably wrong.

### 2. Sync second

After the model is correct, wire it through `useGeneratorDocument.ts` so graph
edits, history, selection, URL imports, localStorage, IndexedDB asset/project
flows, and `.artifact.json` import/export all agree.

### 3. UI third

Only then update the node canvas UI, layer panel, menus, inspectors, galleries,
or preview surfaces. UI work should reveal engine state, not redefine it.

### 4. Preserve dual-mode behavior

This app has both stack and graph workflows. When changing graph or render
logic, confirm whether the change should affect:

- layer stack editing
- graph-target previews
- node thumbnails/gallery
- export rendering
- all surfaces

Make that scope explicit in code and tests.

### 5. Keep docs and examples in sync

If you add a node, layer kind, graph rule, editing flow, persistence behavior,
render mode, or effect control, update the human guidance too:

- architecture docs under `docs/`
- `README.md`
- `COPILOT.md`
- `CLAUDE.md`
- `apps/web/app/routes/docs.nodes.tsx` when user-facing node/effect/source docs change
- `.github/copilot-instructions.md` if that file is reintroduced

### 6. Validate with existing commands

Use the repo's existing validation commands:

```bash
npm run format:check
npm run typecheck
npm run lint
npm run test
npm run build
npm run test:browser
npm run perf:node-editor
```

`npm run check` combines format check, lint, typecheck, and unit/render tests.
The production release gate is `npm run check`, `npm run build`, and
`npm run test:browser`.

## Operational directives

1. Prioritize pure logic tests before UI interaction tests.
2. Mock image loading, GPU-heavy paths, WebGL paths, and browser storage when a
   lower test layer can prove the graph flow.
3. Warn immediately if code tries to place non-serializable or DOM-heavy objects
   into node/document state.
4. Preserve immutable document updates: clone before mutation, then commit
   through the document update flow.
5. Prefer small, composable helpers over mixing graph math into React
   components.
6. Keep node-local gestures local during the gesture and commit once at the end
   unless live document updates are explicitly required.
7. Do not reintroduce primitive placement controls or write interactive
   primitive camera movement into layer tilt fields.
8. Do not let React Flow global pan/zoom receive events meant for node-local
   controls.
9. Do not add new effect or source parameters without updating factories,
   defaults, presets/randomization, controls, renderer, docs, and tests.
10. Use feature folders and explicit variants for new UI surfaces; avoid large
    boolean-mode components.
