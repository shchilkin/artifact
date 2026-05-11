# Artifact Improvement Plan

This plan turns the current roadmap into an executable sequence. It focuses on making the editor predictable before adding more features. The highest-value work is not another effect or control; it is clarifying state ownership, proving preview/export parity, and reducing the number of places where one interaction can accidentally trigger unrelated rerenders.

## Guiding decision

Artifact should have one rendering truth and clear state boundaries.

That means:

- `CanvasDocument` stores durable artwork data.
- The node graph stores composition structure.
- Gesture drafts stay local until committed.
- Primitive camera state is live view/export state, not a side-effect of layer tilt sliders.
- Preview, thumbnail, gallery, and export use the same render entry points.

If a change violates one of these rules, it should be redesigned before implementation.

## Phase 1: Stabilize current interaction behavior

### Why

Recent bugs came from input gestures writing to document state too often or leaking events into React Flow. Before refactoring larger architecture, lock down the current behavior so future changes have a reliable baseline.

### Steps

1. **Manual interaction pass**
   - Select a text node.
   - Wheel over it.
   - Drag to reposition.
   - Shift-drag to rotate.
   - Confirm the node does not blink during interaction.
   - Confirm one final render settles after the gesture.

2. **Image node pass**
   - Repeat the same checks for an image node.
   - Check `cover`, `contain`, `tile`, and `free` modes.
   - Confirm image preview stays clipped to the node preview frame.

3. **Primitive node pass**
   - Left-drag rotates camera.
   - Right-drag pans camera.
   - Wheel/trackpad zooms camera.
   - Right-click drag does not open context menu.
   - Camera lock disables primitive-local gestures and restores graph gestures.
   - Primitive preview stays clipped inside the thumbnail frame.

4. **Graph gesture pass**
   - Pan and zoom graph outside nodes.
   - Pan and zoom graph over locked primitive node.
   - Confirm unlocked primitive captures only its own viewport gestures.

5. **Export sanity pass**
   - Create a primitive with a non-default camera.
   - Export.
   - Compare against node/gallery preview composition.

### Exit criteria

- No visible text/image blink during wheel or drag.
- Primitive viewport never escapes the node frame.
- Right-click drag pans primitive camera.
- Right-click inside primitive viewport does not open the node context menu.
- Camera lock has obvious behavior: locked means graph gestures pass through.

### Validation

```bash
npm run typecheck
npm run lint
npm test
npx react-router build
```

## Phase 2: Write the state contract

### Why

The code currently has several valid states, but the ownership rules are mostly implicit. Without a written contract, every future interaction risks mixing document state, React Flow state, camera state, and draft state again.

### Steps

1. Create `docs/state-model.md`.
2. Define each state category:
   - durable document state
   - graph state
   - selection/overlay UI state
   - gesture draft state
   - primitive camera state
   - render options
3. For each category, document:
   - owner file/hook
   - whether it persists
   - whether it affects undo
   - whether it affects export
   - whether it invalidates thumbnails
4. Add a "do not" section:
   - do not call document update APIs during high-frequency pointer movement unless there is a draft layer in front
   - do not duplicate camera state into layer tilt fields
   - do not create preview-only render logic that export cannot use

### Exit criteria

- A new engineer can answer "where should this state live?" by reading one document.
- Text/image transform drafts and primitive camera state have explicit owners.
- Undo and thumbnail invalidation expectations are documented.

Current reference: [`state-model.md`](./state-model.md).

## Phase 3: Extract primitive camera ownership

### Why

Primitive camera state currently passes through `NodeCanvas`, `PrimitiveViewport3D`, thumbnails, gallery, and export. It works, but the ownership is spread across too many places. A dedicated hook will make camera behavior easier to test and reason about.

### Steps

1. Create `app/components/node-canvas/hooks/usePrimitiveCameraState.ts`.
2. Move these responsibilities into it:
   - `primitiveViewStates`
   - `updatePrimitiveView`
   - `setPrimitiveViewportActive`
   - camera lock active state
   - `onPrimitiveViewStatesChange` sync
3. Keep `NodeCanvas.tsx` responsible only for wiring the hook into context and React Flow props.
4. Add helper functions:
   - `getPrimitiveViewState(layer)`
   - `setPrimitiveCameraLocked(id, locked)`
   - `resetPrimitiveCamera(layer)`
5. Update `PrimitiveViewport3D` and `LayerPreviewSurface` to call named actions instead of reconstructing camera patches inline.

### Exit criteria

- `NodeCanvas.tsx` no longer manually owns primitive camera reducer logic.
- Camera lock and reset behavior are named actions.
- `primitiveViewStates` remains the state passed to export.

## Phase 4: Extract shared primitive scene recipe

### Why

Preview/export parity is fragile while `PrimitiveViewport3D.tsx` and `primitiveRenderer.ts` each build their own Three.js scene. They should share geometry/material/light/camera recipe code.

### Steps

1. Create `app/utils/primitiveScene.ts`.
2. Move shared functions into it:
   - geometry creation
   - material creation
   - light setup
   - shadow setup
   - camera positioning from `PrimitiveViewportState`
   - mesh transform application
3. Keep renderer lifecycle separate:
   - `PrimitiveViewport3D` owns live WebGL renderer and resize observer
   - `primitiveRenderer.ts` owns offscreen one-shot rendering
4. Make both call the same scene helper.
5. Add a comment in both files that preview/export parity depends on this shared helper.

### Exit criteria

- Shape, material, lights, shadow, camera, and mesh transforms are defined once.
- `PrimitiveViewport3D.tsx` and `primitiveRenderer.ts` no longer duplicate scene constants.
- A primitive camera change affects preview and export through the same helper.

Current rendering reference: [`rendering.md`](./rendering.md).

## Phase 5: Build render parity fixtures

### Why

The product promise is visual. TypeScript and unit tests cannot prove preview equals export. We need deterministic fixtures that catch accidental divergence.

### Steps

1. Add fixture documents under `app/test-fixtures/render/` or `app/utils/__fixtures__/render/`.
2. Start with low-risk Canvas 2D fixtures:
   - fill only
   - text over fill
   - image free-fit over fill
   - emoji deterministic seed
3. Add graph fixtures:
   - primitive source into effect
   - merge node
   - color node
   - export node
4. Add a render helper test that renders:
   - node target preview size
   - export target size normalized down to preview size
5. Compare pixel output for deterministic Canvas-only cases.
6. For GPU/Three.js cases, start with smoke tests:
   - render completes
   - output dimensions match
   - alpha/non-empty pixels exist
   - camera override changes output
7. Later, add tolerant pixel diff if stable enough across environments.

### Exit criteria

- At least one test fails if text/image/primitive render paths diverge.
- Primitive camera override has automated coverage.
- Render tests become part of normal `npm test`.

## Phase 6: Refactor node canvas into focused hooks

### Why

`NodeCanvas.tsx` is doing too much. Large orchestration components make bugs harder to isolate because unrelated concerns share closure state and effects.

### Steps

1. Create `app/components/node-canvas/hooks/`.
2. Extract hooks one by one:
   - `useNodeSelectionSync`
   - `useNodeContextMenus`
   - `useNodeGraphEvents`
   - `useNodeDragState`
   - `useNodeGallery`
   - `usePrimitiveCameraState`
3. Move code without changing behavior.
4. After each extraction, run typecheck and focused manual check.
5. Keep `NodeCanvas.tsx` as:
   - context providers
   - React Flow JSX
   - panel/menu/gallery composition
6. Avoid changing interaction behavior during extraction.

### Exit criteria

- `NodeCanvas.tsx` is mostly composition.
- Each hook has a clear input/output shape.
- Context menu logic is isolated from primitive viewport logic.
- Graph drag state is isolated from document mutation state.

Current node editor reference: [`node-editor.md`](./node-editor.md).

## Phase 7: Unify layer controls

### Why

`Sidebar.tsx` and node `LayerInspector.tsx` duplicate many controls. This causes drift and makes it hard to know which panel is canonical.

### Steps

1. Define field metadata per layer kind:
   - label
   - min/max/step
   - section
   - document patch mapper
   - visibility conditions
2. Create shared control renderers for common field types:
   - slider
   - select
   - color
   - text
   - scale lock
3. Use the same metadata in classic sidebar and node inspector.
4. Keep layout differences in the surface components, not in duplicated business logic.
5. Remove primitive camera angle controls from durable layer metadata.

### Exit criteria

- Adding/removing a durable layer field happens in one place.
- Node inspector and sidebar cannot drift on primitive/text/image fields.
- Camera controls remain node-local, not sidebar sliders.

## Phase 8: Improve thumbnail invalidation

### Why

Current thumbnails use object identity revision maps. This is simple, but too broad. Any layer object replacement can invalidate thumbnails even if the preview-relevant fields did not change.

### Steps

1. Define render signatures per node type.
2. Include only render-relevant fields.
3. Include upstream graph signatures recursively.
4. Include primitive camera state for primitive nodes.
5. Exclude pure UI state:
   - selected
   - hovered
   - expanded panel
   - active menu
6. Collapse queued renders by target id.
7. Add dev-only logging for invalidation cause:
   - layer changed
   - graph changed
   - camera changed
   - image loaded
   - export size changed

### Exit criteria

- Gesture drafts do not trigger thumbnail renders.
- Committed document changes trigger only affected downstream thumbnails.
- Debugging a thumbnail rerender is possible from logs.

## Phase 9: Update public docs

### Why

The README still describes an older mental model. Documentation should match the current product: procedural sources, node graph mode, primitive camera state, graph export, and local interaction drafts.

### Steps

1. Update `README.md`.
2. Add or update:
   - `docs/state-model.md`
   - `docs/rendering.md`
   - `docs/node-editor.md`
   - `docs/testing.md`
3. Link these from `docs/roadmap.md`.
4. Keep `PRODUCT.md` and `DESIGN.md` focused on product/design, not implementation details.

### Exit criteria

- README matches current features.
- Architecture docs explain the core invariants.
- Future contributors can find the correct doc for state, rendering, node editor, and tests.

## Recommended execution order

1. Phase 1: stabilize interactions.
2. Phase 2: write state contract.
3. Phase 3: extract primitive camera hook.
4. Phase 4: share primitive scene recipe.
5. Phase 5: add render parity fixtures.
6. Phase 6: split `NodeCanvas.tsx`.
7. Phase 7: unify controls.
8. Phase 8: improve thumbnail invalidation.
9. Phase 9: update public docs.

Do not start Phase 6 before Phases 2 through 4. Splitting files before the state model is clear will move complexity around without reducing it.

## Risks and mitigations

| Risk | Why it matters | Mitigation |
| --- | --- | --- |
| Preview/export mismatch remains hidden | Visual mismatch is the worst product failure | Add render parity fixtures before large renderer changes. |
| Refactor changes behavior | Node interactions are already sensitive | Extract hooks one at a time without changing behavior. |
| Gesture drafts bypass undo | Users expect undo to restore a previous creative state | Commit drafts once per gesture and verify one undo entry. |
| GPU tests are flaky | WebGL differs across environments | Separate deterministic Canvas tests from tolerant GPU smoke tests. |
| Docs drift again | Architecture is changing quickly | Update docs in the same PR as architectural changes. |

## Definition of done for the full plan

- State ownership is documented.
- Primitive preview and export share scene setup.
- Node interactions do not leak into graph gestures unless intended.
- Render parity has automated coverage.
- `NodeCanvas.tsx` is decomposed into focused hooks.
- Sidebar and node inspector share field definitions.
- Thumbnail invalidation is explainable and scoped.
- README and `/docs` describe the current system accurately.
