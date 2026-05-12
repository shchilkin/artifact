# Improvement Plan

This checklist is the working plan for making Artifact easier to maintain and
easier for coding agents to change safely. It is intentionally practical: each
phase should leave the repo in a better state even if later phases change.

## Current baseline

- `npm run check` passes.
- `npm run build` passes, with expected favicon fallback noise in restricted
  environments and a Vite chunk-size warning.
- The node canvas already has focused hooks for selection, context menus,
  graph events, dragging, gallery state, and primitive camera state.
- Primitive live/offscreen rendering already shares `app/utils/primitiveScene.ts`.
- Node thumbnails already use render signatures and a render queue.
- Editable document import/export is available through `.artifact.json`.

## Remaining Work Snapshot

This section is the short operational checklist. The phase sections below remain
the detailed source of truth.

### Highest leverage next

- [x] Extract history/update behavior from `useGeneratorDocument.ts` into named
  update modes: `snapshot`, `debounce`, and `silent`.
- [ ] Add document-sync tests for undo/redo, graph creation, document import,
  and serialization-safe round trips.
- [ ] Add tests proving continuous gestures create one undo snapshot.
- [ ] Replace remaining classic sidebar control duplication with shared
  layer-control metadata.

### Rendering and parity

- [ ] Split `app/utils/renderer.ts` behind the existing `renderDocument` and
  `renderGraphTarget` facades.
- [ ] Add render fixtures for image free-fit, procedural source layers, primitive
  camera overrides, and graph export traversal.
- [ ] Keep export, preview, thumbnails, gallery, and presets on the same public
  renderer entry points.
- [ ] Define a GPU/WebGL tolerance strategy before adding visual snapshots.

### Node editor and UX hardening

- [ ] Keep graph node creation model-first, then document sync, then UI.
- [ ] Add targeted tests around React Flow edge mapping if visual mapping logic
  changes.
- [ ] Preserve node-local primitive camera controls and prevent graph zoom/pan
  from receiving node-control gestures.
- [ ] Keep the node settings row and floating controls aligned with the current
  node-canvas direction.

### Production readiness

- [ ] Resolve or intentionally ignore `public/favicon.png` local noise before
  pushing a release branch.
- [ ] Keep `README.md`, `AGENTS.md`, `COPILOT.md`, `CLAUDE.md`, and
  `.github/copilot-instructions.md` aligned when architecture docs move.
- [ ] Add versioned document schema/migration tests before changing persisted
  document shape again.
- [ ] Decide whether large image assets stay as document data URLs, move to
  IndexedDB, or remain out of scope until backend persistence exists.

Recommended next commit: extract history/update modes and add the first
document-sync tests. That is the best foundation for the remaining renderer and
node-editor work.

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
- [ ] Add render fixtures for image free-fit and procedural source layers where
  the Node test environment is stable.
- [x] Add graph render fixtures for merge node, color node, and export-node
  traversal.
- [x] Add URL/localStorage document normalization tests.
- [ ] Add document-sync tests for graph creation, undo/redo, and
  serialization-safe round trips.
- [x] Add thumbnail signature tests so render-relevant and UI-only changes are
  distinguished explicitly.

Exit criteria:

- `docs/testing.md` describes current coverage and planned coverage separately.
- Every new graph rule has a pure-helper test before UI wiring.
- Render parity tests cover at least one stack path and one graph path.

## Phase 2: Pure Boundaries

Goal: keep domain logic independent from React and React Flow.

- [x] Move the React Flow edge adapter `toRFEdges` out of
  `app/utils/nodeGraph.ts` into the node-canvas feature folder.
- [x] Keep `app/utils/nodeGraph.ts` limited to serializable graph data,
  traversal, mutation, validation, and layout.
- [ ] Add tests around the moved adapter only where visual mapping logic is
  meaningful.
- [ ] Keep graph node creation rules model-first, then document sync, then UI.

Exit criteria:

- `app/utils/nodeGraph.ts` imports only domain types and pure utilities.
- React Flow-specific shapes live under `app/components/node-canvas`.
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
- [ ] Keep layer commands and graph commands small enough to test without
  rendering React.
- [ ] Add tests proving continuous gestures create one undo snapshot.
- [ ] Add tests proving graph edits survive undo/redo.

Exit criteria:

- `useGeneratorDocument.ts` orchestrates smaller helpers instead of owning every
  document concern directly.
- History behavior is named at call sites rather than hidden behind timing.
- Persistence and normalization can be tested without mounting the generator UI.

## Phase 4: Renderer Modularity

Goal: split renderer internals without creating a second render truth.

- [ ] Keep `renderDocument` and `renderGraphTarget` as the public facade.
- [ ] Move canvas helpers into `app/utils/render/canvas.ts`.
- [ ] Move graph traversal rendering into `app/utils/render/graph.ts`.
- [ ] Move layer renderers into `app/utils/render/layers/*`.
- [ ] Keep `primitiveScene.ts` as the shared Three.js scene recipe.
- [ ] Add or update render parity tests with every moved renderer slice.

Exit criteria:

- Preview, node thumbnails, gallery, presets, and export still call the same
  public renderer entry points.
- Moved modules can be tested without understanding the full renderer file.
- No preview-only renderer is introduced except explicit draft UI paths.

## Phase 5: Inspector and Control Convergence

Goal: prevent classic layer controls and node inspector controls from drifting.

- [x] Share layer field ranges and option lists through
  `app/components/layer-controls/fieldDefs.ts`.
- [x] Route node layer inspector controls through shared `LayerControls`.
- [ ] Replace duplicated classic sidebar controls with shared control metadata
  and sidebar-specific framing.
- [ ] Keep primitive camera controls node-local; durable primitive parameters
  stay in inspector/sidebar controls.

Exit criteria:

- Adding a layer field requires updating one control definition path.
- Sidebar and node inspector expose the same durable layer fields unless an
  intentional difference is documented.

## Phase 6: Performance and Build Ergonomics

Goal: keep the app responsive and make validation boring.

- [x] Investigate Vite chunk warnings for renderer, NodeCanvas, Pixi, and Three.
- [x] Add a CI-friendly build script that skips favicon generation explicitly.
- [ ] Keep thumbnail rendering queued and signature-based.
- [ ] Add dev logging for thumbnail invalidation reasons only where it helps
  diagnose real performance issues.

Exit criteria:

- `npm run build` and CI build output are predictable in restricted environments.
- [x] Large chunks are either split intentionally or documented as acceptable.
- Thumbnail invalidation can be explained from signatures, not guessed from
  object identity.

## Working Rule

When a change touches state ownership, rendering, node editor behavior,
thumbnails, preview/export parity, or 3D primitive controls, update the relevant
architecture doc in the same patch and run the lowest useful tests before
broader validation.
