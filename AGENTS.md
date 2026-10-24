# AGENTS.md

The single instruction file for agents working in this repository (Codex,
Claude Code, Copilot). `CLAUDE.md` and `.github/copilot-instructions.md` only
point here. Do not copy rules from this file into other files; link to it.

## What Artifact is

A browser-based creative editor for album covers and posters. Users compose
layered artwork (emoji, image, text, fill, effect, primitive, noise, array
sources) in a layer stack or a node graph, then export PNG/JPEG. The editor
lives at `/app` (`apps/web/app/routes/editor.tsx`).

Monorepo:

- `apps/web` — React Router v7 app (editor, docs, public routes)
- `apps/api` — backend (accounts, sharing, AI generation)
- `apps/backoffice` — admin app, see `docs/backoffice.md`
- `packages/shared`, `packages/ui` — shared types and UI primitives

Stack: React 19, React Router 7 (framework mode, SSR/prerender), TypeScript 6
strict, Vite 8, Tailwind v4, React Flow (`@xyflow/react`), XState, Canvas 2D,
PixiJS 7 (lazy-loaded), Three.js.

## Current focus

`docs/roadmap.md` is the only place that says what is active now and in what
order. Plans in `docs/version-plans/` are named by topic until they ship; the
next release takes the next version number and its plan becomes `vX.Y.md`
(`docs/version-planning.md`, "Numbering"). Shipped plans
and historical docs live in `docs/archive/` and are not current scope.

## Read the doc for the area you touch

Read only what the change needs. These docs are the source of truth; if this
file disagrees with them, fix this file.

| Area | Doc |
| --- | --- |
| Document state, undo, persistence, assets | `docs/state-model.md` |
| Rendering, preview/export parity, thumbnails, caches | `docs/rendering.md` |
| Node canvas interaction and event isolation | `docs/node-editor.md` |
| Adding or changing effect parameters | `docs/effect-development.md` |
| User-facing UI | `docs/style-guide.md`, `docs/editor-design-system.md` |
| Feature folders and component boundaries | `docs/app-structure-guidelines.md` |
| Tests and CI coverage | `docs/testing.md` |
| Render performance | `docs/performance.md` |
| Domain language | `CONTEXT.md`, decisions in `docs/adr/` |
| Version scope | `docs/version-planning.md` |
| Releases and deploys | `docs/production-readiness.md`, `docs/deployment.md` |

## Commands

```bash
npm run dev            # web dev server
npm run typecheck      # web typegen + tsc
npm run lint
npm test               # web unit + render tests (Vitest)
npm run check          # full local gate: format, lint, all typechecks, all unit suites
npm run build
npm run test:browser   # Playwright (Chromium, Firefox, WebKit, mobile)
npm run test:golden    # golden render pixel hashes in the CI container (Docker)
npm run perf:node-editor
```

Engine changes must keep golden render fixtures unchanged
(`apps/web/app/test-fixtures/render/golden/`, see `docs/testing.md`). Update
baselines only for an approved pixel change.

Run Vitest through the workspace scripts (or from `apps/web`), not from the repo
root: the root has no Vitest config and the canvas polyfill will not load.

The release gate is the command list in `docs/production-readiness.md`
(`## Release Gate`). That list is the only definition of the gate.

## Architecture facts

- `CanvasDocument` (`apps/web/app/types/config.ts`) is the serialized source of
  truth: `{ schemaVersion, global, layers, graph, export, *Assets? }`. Every
  document has a graph; build documents in code with `makeDocument`.
- All rendering goes through the graph renderer: `renderDocument` in
  `apps/web/app/utils/renderer.ts` renders `doc.graph`. A layer-stack document
  stores the linear graph of its layers (`isLayerStackGraph`), and Layers edits
  keep it in sync. Renderer internals live under `apps/web/app/utils/render/`.
- Effect layers run a Canvas 2D / worker pass, then an optional PixiJS filter
  pass. Effect parameters are declared once in `apps/web/app/types/effectSchema.ts`
  (`EFFECT_PARAMS`, `EFFECTS`): defaults, inspector controls, backend, and docs
  ranges are derived from it. Each effect has exactly one
  backend (`canvas`, `worker`, or `gpu`); `effectSchema.test.ts` renders every
  effect to enforce this. See `docs/effect-development.md`.
- Document state lives in `apps/web/app/hooks/useEditorDocument.ts`. Every
  durable edit is a named command in `apps/web/app/utils/documentDispatch.ts`
  that declares its history policy (`snapshot`, `debounce`, or `silent`);
  history is the pure reducer in `apps/web/app/utils/documentHistory.ts` (max
  50 entries), and undo/redo go through it. Add a command instead of setting
  the document. Pure document transforms live in
  `apps/web/app/utils/documentCommands.ts` and graph helpers in
  `apps/web/app/utils/nodeGraph.ts`.
- Loading goes through `normalizeDocument` in
  `apps/web/app/utils/documentPersistence.ts`. It first runs the one-shot schema
  migrations in `apps/web/app/utils/migrations/` (one file per version step),
  then only fills defaults and validates. To change the stored format, bump
  `DOCUMENT_SCHEMA_VERSION` and add a migration step with a fixture test; never
  add legacy-format branches to `normalizeDocument`.
- The active document is stored in localStorage under key `doc`. Imported images
  are `artifact-asset://` references backed by IndexedDB
  (`utils/assetStore.ts`); projects and recovery drafts are IndexedDB records
  (`utils/projectStore.ts`).
- Size values are authored at 540px (`REF = 540`) and scaled by `W / REF`.

- Graph-only nodes (merge, color, mask, shader, …) live in
  `CanvasGraph.nodes`, one map keyed by id with a `kind` discriminant. Each kind
  is defined in three places, one module each: the document model
  (`utils/nodeKinds/<kind>.ts`: type, factory, normalizer, render inputs, render
  signature, insertion, canvas look, Add Library data), the renderer
  (`utils/render/nodeKinds/<kind>.ts`), and the editor UI
  (`components/node-canvas/nodeKinds/<kind>.tsx`: React Flow node). Each is
  registered by one line in `GRAPH_NODE_MODELS`, `GRAPH_NODE_RENDERERS`,
  `GRAPH_NODE_UIS`, and `GRAPH_NODE_INSPECTORS`. Generic code iterates the
  registries; never switch on a node kind outside a kind's own modules
  (`nodeKindLocality.test.ts` checks this with grime shadow).

The v0.51 core reset (`docs/version-plans/v0.51.md`) removed the parallel
paths: one topology source, node-kind and effect registries, one command
dispatcher. Extend those instead of adding new parallel paths.

## Invariants

1. Treat documents as immutable: clone (`cloneDocument`) before mutating and
   commit through a document command (`documentDispatch.ts`). A `silent`
   command must not change any visible result.
2. In a layer-stack document, layer order is render order. Never reorder layers except by an
   explicit user action.
3. Keep `CanvasDocument` JSON-serializable. No DOM nodes, canvases, images,
   Pixi/Three objects, or cameras in the document; caches live outside it.
4. Continuous gestures draft locally and commit one history entry per gesture.
5. Preview, thumbnails, gallery, presets, and export use the public renderer
   entry points. A draft-only shortcut must be labelled and documented.
6. Render caches and signatures must key on every pixel-affecting input.
7. Transparent backgrounds stay transparent in output; checkerboards are UI only.
8. Primitive camera state lives in render options and
   `CanvasGraph.primitiveViewStates`, never in layer tilt fields.
9. Graph areas are organization metadata and must not change traversal.
10. Cycles are blocked with `wouldCreateCycle(...)`; there is no cycle
    exception.
11. Node-local controls must not leak pointer/wheel events to React Flow
    pan/zoom.
12. Never import PixiJS or Three.js at module top level in code that runs on
    the server. Prerendered routes (`delivery.prerender` in
    `docs/loading/route-loading-contract.json`) and the root render in Node:
    keep `window`, storage, WebGL, and auth work in effects or lazy imports, and
    keep the first render identical on server and client.
13. Do not add `as unknown` casts to escape type errors; fix the types.

## User-facing copy boundary

App UI, public routes, docs pages, and style-guide surfaces contain only
product/help copy. Agent workflow, migration plans, QA strategy, test names,
and release commentary belong under `docs/`. No copy like "baseline", "migrate
carefully", or "focused Playwright checks" in the product.

## How to work

- **Model first, sync second, UI third.** Change types and pure logic before
  hooks, and hooks before components. If a rule cannot be tested without React,
  the boundary is wrong.
- **Lowest useful test.** Pure helpers and document commands in Vitest first,
  then render fixtures, then a focused Playwright test only for what Node cannot
  prove. Mock GPU, WebGL, image loading, and storage where a lower layer is
  enough.
- **Fix bugs test-first.** Reproduce with a failing test, then fix.
- **Update the doc that owns the area.** If a change alters behavior described
  in one of the docs above, update that doc in the same change. Do not add
  summaries of it anywhere else.
- **Scope.** Follow the active version plan's thesis and non-goals
  (`docs/version-planning.md`). Work outside it needs the owner's go-ahead or
  its own plan.
- **Feature folders and explicit variants** for new UI; avoid boolean-mode
  components.

## Releases

Use the `artifact-release` skill (`.codex/skills/artifact-release/SKILL.md`).
Never tag or publish without `docs/releases/vX.Y.Z.md` filled from
`docs/release-template.md`. `npm run release:verify` checks the metadata.

## Tracker and skills

- Issues: GitHub Issues for `shchilkin/artifact` (`docs/agents/issue-tracker.md`,
  labels in `docs/agents/triage-labels.md`).
- Preferred skills: `docs/agent-skills.md`. Fallow reports are advisory; do not
  delete findings without trace validation and tests.
