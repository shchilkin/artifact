# Improvement Plan

This checklist is the working plan for making Artifact easier to maintain and
easier for coding agents to change safely. It is intentionally practical: each
phase should leave the repo in a better state even if later phases change.

## Current baseline

- `npm run check` passes.
- `npm run test:browser` is available for focused browser/WebGL smoke coverage.
- `npm run build` passes with a committed static SVG favicon and a Vite
  chunk-size warning.
- CI has separate fast quality/build and browser smoke jobs.
- The node canvas already has focused hooks for selection, context menus,
  graph events, dragging, gallery state, and primitive camera state.
- Primitive live/offscreen rendering already shares `apps/web/app/utils/primitiveScene.ts`.
- Node thumbnails already use render signatures and a render queue.
- Editable document import/export is available through `.artifact.json`.
- Effect docs metadata has a dedicated `apps/web/app/utils/effectDocs.ts` module and
  `docs/effect-development.md` describes the effect-change checklist.
- Texture-style effect renderers are split into
  `apps/web/app/utils/render/layers/textureEffects.ts`.
- `EffectInspector.tsx` is now orchestration over data-driven effect section
  definitions instead of one large repeated control surface.
- The editor UI overhaul is tracked in [`ui-overhaul.md`](./ui-overhaul.md):
  node canvas readability, category-color grammar, inspector usability, Add
  Node / Library flow, Layers/Nodes parity, empty starts, and visual QA.

## Remaining Work Snapshot

This section is the short operational checklist. The phase sections below remain
the detailed source of truth.

### v0.2 Product Focus

- [x] Improve first-pass effect control surfaces with family metadata, clearer
  purpose copy, and documentation for what each effect family is good for.
- [ ] Add new focused effects without reintroducing legacy combined FX.
- [x] Add first-class noise/procedural texture creation presets over the
  existing serializable noise layer schema.
- [x] Add a graph-only repeater utility node so any rendered source branch can
  be repeated into line, grid, or radial patterns over an optional backdrop.
- [x] Add per-node seed offsets for procedural sources and repeaters so
  variation can be controlled without changing the document seed.
- [x] Add source-noise shaping controls for domain warp, turbulence, and
  threshold hardness.
- [x] Add repeater presets for common motif workflows.
- [x] Add source/motif docs with practical recipes.
- [x] Add explicit blank-canvas entry points and protect current work before
  replacing it.
- [x] Make node preview aspect ratio behavior predictable across regular node
  thumbnails, graph output previews, and export nodes.
- [x] Add serializable folder/area metadata so layers and node graphs can be
  organized without losing the relationship between the two views.
- [x] Add folder/area UI so layers and node graphs can be organized without
  losing the relationship between the two views.
- [x] Define how the layer list respects node graph structure for advanced node
  workflows.
  Current note: graph-backed layer preview follows nested branches; graph areas
  now appear as non-rendering node-canvas overlays and as layer-row chips. The
  layer panel intentionally stays flat for fast stack editing.
- [x] Improve text/font workflow with a curated bundled display-font expansion.
- [x] Improve node/effect/export documentation with effect-family guidance.
- [x] Improve empty-canvas onboarding around examples, presets, image import,
  text-first starts, and random seeds.

### v0.8 Product Focus

- [ ] Make layer mode feel first-class again: fast stack editing, clear empty
  states, layer-first recipes, and quick controls that do not require opening
  nodes.
- [ ] Improve layer-list organization for graph-area documents so areas read
  like lightweight folders while staying non-rendering metadata.
- [x] Add starter paths for image-first, text-first, noise-first,
  texture-first, and example remix workflows. Keep random seed and mode
  switching in the existing app chrome instead of duplicating them in the empty
  state.
- [x] Add recipe starter documents for common cover workflows.
  Current note: v0.8 starts with a stack-only Texture Type recipe exposed from
  the blank-canvas panel, examples, and docs.
- [x] Plan a sectioned onboarding guide that teaches the app by workflow:
  canvas, layers, nodes, sources, effects, repeaters, export, projects, and
  examples, with prominent section highlights instead of small inline hints.
- [x] Make user-facing docs task-oriented: first cover, layers workflow, nodes
  workflow, effects, sources, repeaters, export, and projects.
- [x] Explain blend modes with practical examples.
- [x] Add troubleshooting docs for blank previews, browser storage limits,
  missing image assets, GPU/WebGL quirks, and export mismatch.
- [x] Add browser smoke coverage for at least one layer-first starter path and
  one docs "try this" path.

### Highest leverage next

- [ ] Advance the editor UI overhaul workstreams in
  [`docs/ui-overhaul.md`](./ui-overhaul.md), starting with Inspector-as-control
  surface and Add Node / Library command-palette improvements.
- [x] Extract history/update behavior from `useEditorDocument.ts` into named
  update modes: `snapshot`, `debounce`, and `silent`.
- [x] Add pure document-sync tests for undo/redo, graph creation, document
  import, and serialization-safe round trips.
- [x] Add tests proving continuous gestures create one undo snapshot at the
  history helper layer.
- [x] Extract layer/document commands into pure helpers with focused tests.
- [x] Replace remaining classic sidebar control duplication with shared
  layer-control metadata.

### Rendering and parity

- [x] Split `apps/web/app/utils/renderer.ts` behind the existing `renderDocument` and
  `renderGraphTarget` facades.
- [x] Add render fixtures for image free-fit, procedural source layers, and graph
  export traversal.
- [ ] Add render fixtures for primitive camera overrides once the Node test
  environment can cover that path reliably.
- [x] Add browser smoke coverage for primitive camera controls and export.
- [ ] Keep export, preview, thumbnails, gallery, and presets on the same public
  renderer entry points.
- [x] Add focused browser smoke coverage before broader visual snapshots.
- [ ] Define a GPU/WebGL tolerance strategy before adding visual snapshots.

### Node editor and UX hardening

- [x] Keep graph node creation model-first, then document sync, then UI.
- [x] Add targeted tests around React Flow edge mapping if visual mapping logic
  changes.
- [ ] Revisit node/effect parameter ranges after hands-on use. Film grain in
  particular needs finer scale/size control so it can be made subtler than the
  current minimum-feeling result.
- [ ] Preserve node-local primitive camera controls and prevent graph zoom/pan
  from receiving node-control gestures.
- [ ] Keep the node settings row and floating controls aligned with the current
  node-canvas direction.

### Production readiness

- [x] Add CI gates for format/lint/typecheck/unit tests, build, and browser
  smoke tests.
- [x] Add a production readiness checklist for manual release QA.
- [x] Ignore generated `apps/web/public/favicon.png` local noise.
- [x] Replace the generated favicon with a deliberate committed static asset
  before production release.
- [ ] Keep `README.md`, `AGENTS.md`, `COPILOT.md`, `CLAUDE.md`, and
  `.github/copilot-instructions.md` aligned when architecture docs move.
- [x] Add versioned document schema/migration tests before changing persisted
  document shape again.
- [x] Decide whether large image assets stay as document data URLs, move to
  IndexedDB, or remain out of scope until backend persistence exists.
- [x] Move local project snapshots and the pre-blank recovery draft out of
  localStorage and into IndexedDB.
- [x] Move imported image payloads out of active document localStorage and into
  IndexedDB asset records while keeping `.artifact.json` export portable.

Recommended next commit: start the v0.8 layer/onboarding pass with a small
slice that improves the blank-canvas start panel and adds one layer-first recipe
document. Keep nodes unchanged unless the layer workflow needs graph-area
metadata to display truthfully.

## Phase 0: Agent Orientation

Goal: make the repo truthful and easy to pick up.

- [x] Keep architecture entry points documented in `AGENTS.md`.
- [x] Document state ownership in `docs/state-model.md`.
- [x] Document render entry points and parity rules in `docs/rendering.md`.
- [x] Document node editor behavior in `docs/node-editor.md`.
- [x] Document structure guidelines in `docs/app-structure-guidelines.md`.
- [ ] Keep `README.md`, `AGENTS.md`, `COPILOT.md`, `CLAUDE.md`, and
  `.github/copilot-instructions.md` aligned when architecture docs move.
- [x] Add or enforce a formatter so future agent patches do not create
  quote-style and wrapping-only diffs.

Exit criteria:

- No architecture doc links are broken.
- A new agent can identify the source-of-truth docs in under a minute.
- Validation commands are listed in one consistent place.

## Phase 1: Test Truthfulness

Goal: make the testing docs match the test suite, then grow coverage from the
lowest useful layer.

- [x] Keep fast unit tests for config defaults, random generation, graph
  helpers, node reducer behavior, and node helper utilities.
- [x] Keep deterministic Canvas 2D render smoke/parity tests.
- [x] Add graph helper tests for `addGraphEdge`, `removeGraphEdge`,
  `add/removeMergeNode`, `add/removeColorNode`, `wouldCreateCycle`, and
  `organizeGraph`.
- [x] Add render fixtures for image free-fit and procedural source layers where
  the Node test environment is stable.
- [x] Add graph render fixtures for merge node, color node, and export-node
  traversal.
- [x] Add URL/localStorage document normalization tests.
- [x] Add document-sync tests for graph creation, undo/redo, and
  serialization-safe round trips.
- [x] Add thumbnail signature tests so render-relevant and UI-only changes are
  distinguished explicitly.
- [x] Add focused Playwright browser smoke tests for layer/node tab switching,
  primitive camera controls, and browser export.

Exit criteria:

- `docs/testing.md` describes current coverage and planned coverage separately.
- Every new graph rule has a pure-helper test before UI wiring.
- Render parity tests cover at least one stack path and one graph path.
- Browser-only regressions have a small Playwright safety net.

## Phase 2: Pure Boundaries

Goal: keep domain logic independent from React and React Flow.

- [x] Move the React Flow edge adapter `toRFEdges` out of
  `apps/web/app/utils/nodeGraph.ts` into the node-canvas feature folder.
- [x] Keep `apps/web/app/utils/nodeGraph.ts` limited to serializable graph data,
  traversal, mutation, validation, and layout.
- [x] Add tests around the moved adapter only where visual mapping logic is
  meaningful.
- [x] Keep graph node creation rules model-first, then document sync, then UI.

Exit criteria:

- `apps/web/app/utils/nodeGraph.ts` imports only domain types and pure utilities.
- React Flow-specific shapes live under `apps/web/app/components/node-canvas`.
- Existing graph tests still run without React Flow imports.

## Phase 3: Document State and History

Goal: make document updates deliberate and testable.

- [x] Extract document normalization and initial-load helpers.
- [x] Extract remaining document persistence helpers for localStorage save, URL
  import cleanup, and share-link creation.
- [x] Add `.artifact.json` document import/export through the same normalized
  document replacement path.
- [x] Extract history behavior behind explicit update modes such as snapshot,
  merge/debounce, and silent.
- [x] Keep remaining graph commands small enough to test without rendering
  React.
- [x] Keep layer commands small enough to test without
  rendering React.
- [x] Add tests proving continuous gestures create one undo snapshot.
- [x] Add tests proving graph edits survive undo/redo.

Exit criteria:

- `useEditorDocument.ts` orchestrates smaller helpers instead of owning every
  document concern directly.
- History behavior is named at call sites rather than hidden behind timing.
- Persistence and normalization can be tested without mounting the generator UI.

## Phase 4: Renderer Modularity

Goal: split renderer internals without creating a second render truth.

- [x] Keep `renderDocument` and `renderGraphTarget` as the public facade.
- [x] Move renderer implementation behind `apps/web/app/utils/render/*` so callers use
  the facade.
- [x] Move canvas helpers into `apps/web/app/utils/render/canvas.ts`.
- [x] Move graph traversal rendering into `apps/web/app/utils/render/graph.ts`.
- [x] Move layer renderers into `apps/web/app/utils/render/layers/*`.
- [x] Keep `primitiveScene.ts` as the shared Three.js scene recipe.
- [x] Add or update render parity tests with every moved renderer slice.

Exit criteria:

- Preview, node thumbnails, gallery, presets, and export still call the same
  public renderer entry points.
- Moved modules can be tested without understanding the full renderer file.
- No preview-only renderer is introduced except explicit draft UI paths.

## Phase 5: Inspector and Control Convergence

Goal: prevent classic layer controls and node inspector controls from drifting.

- [x] Share layer field ranges and option lists through
  `apps/web/app/components/layer-controls/fieldDefs.ts`.
- [x] Route node layer inspector controls through shared `LayerControls`.
- [x] Add shared control metadata for durable layer sections and primitive
  placement exclusions.
- [x] Replace duplicated classic sidebar controls with shared control metadata
  and sidebar-specific framing.
- [x] Keep primitive camera controls node-local; durable primitive parameters
  stay in inspector/sidebar controls.

Exit criteria:

- Adding a layer field requires updating one control definition path.
- Sidebar and node inspector expose the same durable layer fields unless an
  intentional difference is documented.

## Phase 6: Performance and Build Ergonomics

Goal: keep the app responsive and make validation boring.

- [x] Investigate Vite chunk warnings for renderer, NodeCanvas, Pixi, and Three.
- [x] Build no longer depends on favicon generation; the generator remains
  available as an explicit manual script.
- [x] Keep thumbnail rendering queued and signature-based.
- [ ] Add dev logging for thumbnail invalidation reasons only where it helps
  diagnose real performance issues.

Exit criteria:

- `npm run build` and CI build output are predictable in restricted environments.
- [x] Large chunks are either split intentionally or documented as acceptable.
- Thumbnail invalidation can be explained from signatures, not guessed from
  object identity.

## Phase 7: Public Beta Hardening

Goal: make the current browser editor safe to ship before platform features.

- [x] Split CI into a fast quality/build job and a browser smoke job.
- [x] Upload Playwright artifacts on browser test failure.
- [x] Add a release checklist in `docs/production-readiness.md`.
- [x] Add a browser regression proving layer visibility changes rendered pixels.
- [ ] Complete the manual QA checklist before public beta.
- [ ] Test Safari and Firefox manually before public announcement.
- [ ] Write release notes that call out accepted GPU/WebGL and localStorage risks.

Exit criteria:

- Every release candidate has a green CI run.
- Browser smoke tests pass in CI or are explicitly waived with a reason.
- Manual QA has been run against the deployed build, not only local dev.

## Working Rule

When a change touches state ownership, rendering, node editor behavior,
thumbnails, preview/export parity, or 3D primitive controls, update the relevant
architecture doc in the same patch and run the lowest useful tests before
broader validation.
