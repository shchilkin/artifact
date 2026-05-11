# AGENTS.md

## Project scope

Artifact is a browser-only album-cover generator with a hybrid editing model:

- a canonical layered document (`CanvasDocument`)
- an optional node graph (`doc.graph`) for graph-driven composition
- a React Flow canvas for editing graph structure
- a Canvas 2D + PixiJS renderer for preview and export

Treat it like a node-based application, but adapt advice to this codebase instead of applying a generic DAG template.

## Architecture stance: logic vs canvas

### 1. Graph engine

Keep graph rules, traversal, and validation centered in pure data and helpers:

- graph types live in `app/types/config.ts`
- graph helpers live in `app/utils/nodeGraph.ts`
- key behaviors include edge insertion, upstream traversal, render-order resolution, layout, and cycle prevention

The long-term goal is strict engine/UI separation. Current reality is close but not perfect: `app/utils/nodeGraph.ts` still contains a small React Flow adapter (`toRFEdges`). Do not push more UI concerns into graph helpers; move in the opposite direction when touching this area.

### 2. State/document sync

`app/hooks/useGeneratorDocument.ts` is the bridge between graph edits, layer edits, undo/redo, URL import, and localStorage persistence. Preserve this boundary:

- `CanvasDocument` is the serialized source of truth
- graph edits must stay compatible with history and persistence
- state must remain serializable JSON

Never store DOM nodes, WebGL objects, `ImageBitmap`s, or other non-serializable data inside `CanvasDocument`, `CanvasGraph`, or node metadata.

### 3. Renderer and UI

The UI should read and manipulate state, not define graph semantics:

- `app/components/node-canvas/*` renders and edits nodes
- `app/components/node-canvas/machine.ts` owns canvas selection/overlay state via XState
- `app/utils/renderer.ts` turns document state into pixels

Important current behavior:

- `CanvasPreview` forces `graphMode: 'stack'` for the main cover preview
- `NodeGalleryCanvas` uses graph rendering for graph-target previews

Do not accidentally make standard cover preview behavior depend on node-graph structure unless that change is explicit and intentional.

## Architecture anchors

- `CanvasDocument = { global, layers, graph?, export }`
- `CanvasGraph = { edges, positions, mergeNodes, colorNodes }`
- graph nodes are a mix of layer-backed nodes plus graph-only merge/color/export nodes
- render order comes from graph traversal helpers such as `resolveRenderOrder()` and `resolveUpstreamRenderLayers()`
- cycle checks currently use `wouldCreateCycle(...)`; this repo blocks invalid edges instead of throwing a dedicated cycle exception

If you add a new graph node concept, update all relevant surfaces together:

1. graph types and factories in `app/types/config.ts`
2. graph helpers in `app/utils/nodeGraph.ts`
3. document sync in `app/hooks/useGeneratorDocument.ts`
4. React Flow node construction in `app/components/node-canvas/buildRFNodes.ts`
5. node UI in `app/components/node-canvas/nodes/*` and the properties panel
6. any graph-aware rendering or preview paths
7. tests and docs

## Testing strategy blueprint

Use TypeScript by default. Prefer the lowest test layer that proves the behavior.

### 1. Unit tests: pure engine first

Start with `Vitest` around pure helpers and machine logic.

Priorities:

- graph mutation helpers: `addGraphEdge`, `removeGraphEdge`, `splitEdgeWithNode`, `add/removeMergeNode`, `add/removeColorNode`
- traversal and ordering: `resolveRenderOrder`, `resolveUpstreamRenderLayers`, `collectUpstreamNodeIds`, `organizeGraph`
- validation rules: `wouldCreateCycle` and any future port/type validation
- XState/pure selection helpers in `app/components/node-canvas/machine.ts`
- geometry and selection helpers in `app/components/node-canvas/helpers.ts`

Project-specific rule: when testing cycle handling, assert that `wouldCreateCycle(...)` returns `true` and that the UI path rejects the connection. Do not write tests that expect a `CycleDetectedError` unless the implementation actually gains one.

### 2. Integration tests: document sync and persistence

Target state transitions that cross file boundaries:

- `useGeneratorDocument` keeping `doc`, `doc.graph`, selection, and history in sync
- graph edits surviving undo/redo
- `normalizeDocument()` preserving compatibility for stored documents and `?doc=` imports
- serialization/deserialization round-trips through localStorage-safe JSON
- graph-aware rendering choosing the correct traversal mode without mutating the document

When a change affects both graph state and visible preview behavior, test the state boundary first and the rendered result second.

### 3. E2E tests: only if a browser suite is introduced

This repo currently uses `Vitest`; no Playwright or Cypress suite is configured. Do not add a browser framework unless the task calls for it.

If E2E coverage is added later, focus on:

- connecting ports by drag interaction
- pan/zoom and selection behavior on the node canvas
- inserting merge/color nodes into existing edges
- exporting or previewing a simple graph-backed composition

### 4. Visual regression

If visual snapshots are introduced, cover:

- edge alignment and handle positioning
- node canvas at multiple zoom levels
- parity between graph-target previews and final rendered output where intended

### 5. Performance and stress

Watch for node-editor performance pitfalls:

- large synthetic graphs should exercise pure helpers before UI benchmarks
- dragging one node should not cascade unnecessary re-renders across unrelated nodes
- deleting graph sections must not leave stale heavy references behind

State should stay light and serializable; caches belong outside the document.

## Development strategy

### 1. Model first

Change the data model and pure graph logic before changing React Flow components. If the rule cannot be expressed or tested without React, the boundary is probably wrong.

### 2. Sync second

After the model is correct, wire it through `useGeneratorDocument.ts` so graph edits, history, selection, URL imports, and localStorage all agree.

### 3. UI third

Only then update the node canvas UI, node panels, menus, or preview surfaces. UI work should reveal engine state, not redefine it.

### 4. Preserve dual-mode behavior

This app has both stack and graph paths. When changing graph logic, confirm whether the change should affect:

- stack preview only
- graph-target previews only
- export rendering
- all three

Make that scope explicit in code and tests.

### 5. Keep docs and examples in sync

If you add a node, layer kind, graph rule, or editing flow, update the human guidance too:

- `COPILOT.md`
- `.github/copilot-instructions.md`
- `CLAUDE.md`
- `app/routes/docs.nodes.tsx` when user-facing node docs change

### 6. Validate with existing commands

Use the repo's existing validation commands:

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

## Operational directives

1. Prioritize pure logic tests before UI interaction tests.
2. Mock image loading, GPU-heavy paths, and other external effects when testing graph flow.
3. Warn immediately if code tries to place non-serializable or DOM-heavy objects into node/document state.
4. Preserve immutable document updates: clone before mutation, then commit through the document update flow.
5. Prefer small, composable helpers over mixing graph math into React components.
