# Artifact Codebase Overview and Roadmap

For the step-by-step implementation plan, see [`improvement-plan.md`](./improvement-plan.md).

Related architecture docs:

- [`state-model.md`](./state-model.md)
- [`rendering.md`](./rendering.md)
- [`node-editor.md`](./node-editor.md)
- [`app-structure-guidelines.md`](./app-structure-guidelines.md)
- [`testing.md`](./testing.md)
- [`improvement-plan.md`](./improvement-plan.md)
- [`production-readiness.md`](./production-readiness.md)

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

Both views must stay truthful. If nodes define a meaningful structure, the layer
view should respect that structure through folders, areas, or graph-derived
grouping instead of becoming a misleading flat stack.

v0.3 starts this organization track with serializable graph area metadata in
`CanvasGraph.areas`. Areas are organizational only for now; they do not change
render order or traversal until a dedicated render behavior is designed.

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
- Dark/light theme mode.
- Improved empty-canvas onboarding.
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
- Server-side project saving.
- Server-backed share links.
- Preset database and community preset browsing.
- User galleries or portfolio pages.
- Subscription/paywall experiments.
- AI image generation node or workflow.
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
| Routing | `app/routes.ts`, `app/routes/*.tsx` | React Router v7 in SPA mode, `ssr: false`. |
| Main generator | `app/routes/generator.tsx` | Switches between layer view and node view. Owns high-level UI composition. |
| Document state | `app/hooks/useGeneratorDocument.ts` | Canonical `CanvasDocument`, selection, undo/redo, localStorage persistence, graph mutations. |
| Asset state | `app/hooks/useGeneratorAssets.ts` | Image upload/drop handling and `imageCache`. |
| Export | `app/hooks/useGeneratorExport.ts`, `app/utils/exportCanvas.ts` | Uses `renderDocument` with live primitive camera overrides. |
| Presets | `app/hooks/usePresets.ts`, `app/components/PresetsPanel.tsx` | localStorage-backed presets with thumbnails. |

### Data model

The canonical document type is `CanvasDocument` in `app/types/config.ts`.

```ts
interface CanvasDocument {
  global: GlobalConfig;
  layers: Layer[];
  graph?: CanvasGraph;
  export?: ExportConfig;
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

The layer stack remains the portable document model. The node graph is an optional editing/composition layer on top of the same document. This is good: it keeps old documents renderable and lets the app support both layer-stack and graph workflows.

### Rendering pipeline

Rendering is concentrated in `app/utils/renderer.ts`.

1. `renderDocument` decides whether to use stack mode or graph mode.
2. `renderGraphTarget` walks graph dependencies and renders each node.
3. `applyLayerToCanvas` draws one layer over an input canvas.
4. Canvas 2D handles text, image, fills, emojis, procedural sources, and some effect passes.
5. PixiJS handles GPU effect filters.
6. Three.js renders primitives through `app/utils/primitiveRenderer.ts`.

This is the most important invariant:

> Preview, thumbnail, gallery, and export should call the same render path with the same document, graph, images, and live primitive camera state.

### Node canvas

Node editing lives under `app/components/node-canvas`.

| Area | Files | Current role |
| --- | --- | --- |
| Canvas shell | `NodeCanvas.tsx` | React Flow integration, context providers, graph events, gallery modal, transient primitive camera state. |
| State machine | `machine.ts` | XState state for selection and overlays. |
| Node construction | `buildRFNodes.ts` | Converts `CanvasDocument + CanvasGraph` to React Flow nodes. |
| Node components | `nodes/NodeTypes.tsx`, `nodes/NodeShell.tsx` | Layer, merge, color, and output node renderers. |
| Previews | `thumbnails/NodeThumbnail.tsx`, `thumbnails/LayerPreviewSurface.tsx` | Cached async thumbnails plus interactive selected-node previews. |
| Inspectors | `inspector/*.tsx`, `panel/NodePropertiesPanel.tsx` | Node-side property controls. |
| Menus | `menus/*.tsx` | Pane and node context menus, including compact add menu. |

The current direction is correct: node editing is a specialized UI over the same document and render model, not a separate editor format.

### Interaction state

There are currently three state tiers:

| Tier | Examples | Persistence |
| --- | --- | --- |
| Document state | Layers, effect parameters, graph edges, graph positions, export config | Saved in `CanvasDocument`. |
| Session/UI state | Selection, open panels, gallery view, primitive camera overrides | In React state and context. |
| Gesture draft state | Text/image local transform drafts, active primitive drag state | Component-local refs/state, committed after gesture. |

This split is necessary, but it needs stricter boundaries. Most recent bugs came from transient gesture state writing to document state too often, causing thumbnails and React Flow nodes to rebuild during interaction.

## What is good

### Strong product identity

`PRODUCT.md` and `DESIGN.md` are unusually specific. The app has a clear audience, mood, and visual vocabulary: warm dark neutrals, mono UI, square controls, rare accent use, and a raw zine-like tone. This makes design decisions easier.

### Canonical document model

`CanvasDocument` is a good core. It is serializable, localStorage-friendly, export-friendly, and already supports both stack and graph modes. Keeping the document portable is one of the healthiest parts of the codebase.

### Shared rendering path

The app generally uses `renderDocument` and `renderGraphTarget` across preview, thumbnails, examples, and export. That is the right architecture for "what you see is what you export."

### Layer factories and migration helpers

Factory functions in `config.ts` reduce malformed layer creation. `normalizeDocument` and compatibility handling in `useGeneratorDocument.ts` keep old documents usable.

### Good low-level testing coverage for data logic

Existing tests cover:

- config defaults and layer creation
- random document generation
- node graph helpers
- node canvas reducer/helpers

These tests protect the model layer from regressions.

### Node canvas direction is promising

Using React Flow for graph mechanics and XState for selection/overlay state is a good fit. The node add menu has moved toward a compact, direct, Blender-like interaction model, which matches the product.

## What is bad or risky

### `generator.tsx` and `NodeCanvas.tsx` are too central

Both files coordinate too many concerns. `generator.tsx` wires document state, asset state, export, presets, layout mode, preview, sidebar, and node mode. `NodeCanvas.tsx` owns React Flow, graph operations, gallery modal, primitive camera state, selection sync, context menus, and export UI.

This makes behavior hard to predict because small changes in interaction state can trigger document changes, graph changes, thumbnail renders, and React Flow rebuilds.

### Transient state boundaries are still fragile

Text/image gestures, primitive camera gestures, gallery view state, React Flow drag state, and document updates all coexist. The code now has draft-state patterns, but there is no central rule that says:

- when to update local UI only
- when to commit to the document
- when to invalidate thumbnails
- when to update undo history

Without that contract, wheel and drag bugs will keep returning.

### Primitive rendering has duplicated scene logic

`PrimitiveViewport3D.tsx` and `primitiveRenderer.ts` both define camera, geometry, materials, lights, and shadow behavior. Recent work aligned these, but they are still separate implementations. That is a long-term preview/export parity risk.

### `renderer.ts` is a large mixed-responsibility module

`renderer.ts` handles:

- Canvas setup
- Layer drawing
- Graph traversal
- effect passes
- color node logic
- merge node logic
- render options

It works, but it is difficult to test in isolation and hard to extend safely.

### Thumbnail invalidation is coarse

`NodeThumbnail` uses object identity revision maps. This is simple, but any layer object replacement increments revision even if the rendered output does not meaningfully change for a specific thumbnail. It also means high-frequency document writes can cause queued renders and stale-looking UI.

### Inspector surfaces are duplicated

Classic layer controls in `Sidebar.tsx` and node controls in `node-canvas/inspector/LayerInspector.tsx` overlap. This creates drift: a field can be removed or redesigned in one surface and remain in the other.

### CSS is a large monolith

`node-canvas.css` contains the full node editor UI. It is coherent visually, but it is becoming hard to reason about. Component boundaries are not reflected in style boundaries.

### Documentation is behind the product

`README.md` still describes the older five-layer model and does not fully explain procedural layers, node graph mode, transient camera state, graph export behavior, or the current node editor architecture.

### No visual regression or render parity tests

The app's main promise is visual. Unit tests are useful, but they do not prove that preview, thumbnails, gallery, and export match. There is no golden-image or pixel-diff coverage for critical renderer paths.

### Persistence is browser-only

localStorage works for a creative toy, but it is fragile for large data URLs, presets, and shareability. There is no robust document sharing or asset persistence story yet.

## Improvement principles

1. **Single source of truth per concern.** Document state, graph state, camera state, and gesture state should each have a named owner.
2. **Draft locally, commit deliberately.** High-frequency gestures should not write to `CanvasDocument` every frame.
3. **Render parity is a feature.** Preview/export equality should be tested, not assumed.
4. **Node controls belong inside nodes when they manipulate node-local view state.** Side panels should edit durable document parameters, not transient camera state.
5. **The renderer should be modular but shared.** Split code for clarity without creating separate preview/export implementations.
6. **Docs should track architecture.** Any major UI/rendering invariant should be documented near the code and in product docs.

## Roadmap

### v0.2: Make Strong Covers Easier

Goal: move from "the beta works" to "the editor helps users reach strong,
controlled covers faster."

Product direction:

- Effects become more controllable and better documented.
- New effects should be focused, composable nodes rather than old combined FX.
- Export becomes predictable: aspect ratio and output scale are honored by layer
  preview, node thumbnails, graph output, examples, and final export.
- Layers remain the fast workflow, nodes become the advanced workflow, and both
  views stay synchronized.

Priorities:

- Add curated example documents that demonstrate real workflows rather than
  only random generation.
- Improve typography and effect defaults so distorted text stays intentionally
  readable instead of accidentally crushed.
- Add a low-resolution / pixelate whole-image node for deliberate cover-wide
  texture.
- Add dedicated noise/procedural texture nodes with preset folders.
- Add more focused procedural texture and effect nodes, keeping the old combined
  FX path out of new examples.
- Improve text workflow with better font browsing, imported fonts, and
  typography presets.
- Add folders or areas so dense layer stacks and node graphs can be organized.
- Make the layer list respect graph structure where node workflows define the
  composition.
- Improve empty-canvas onboarding so a new user can choose between randomizing,
  loading an example, importing an image, or starting from text.
- Improve docs for nodes, effects, exports, examples, and common workflows.
- Keep preview/export parity as a release gate for every rendering-facing
  improvement.

Implemented first slice:

- Node cards now use larger, aspect-aware, high-DPI preview surfaces so regular
  nodes and export nodes share the same preview sizing rules.
- Noise creation includes concrete, film grain, static, cells, clouds, paper,
  and CRT dirt presets without changing the saved document schema.
- Effect help now exposes family intent and "good for" guidance in docs and
  inspector popovers.
- Text has a larger curated display-font set while arbitrary external font
  import remains deferred until persistence and security rules are designed.

Exit criteria:

- A new user can open the app and create a credible cover from an example or
  guided starting point in minutes.
- Text-heavy covers have a clear path to controlled distortion.
- New examples use separated effect nodes and remain editable in the node graph.
- Aspect ratio is respected by every node preview and output surface.
- Layer organization does not contradict node organization.
- Browser smoke and manual QA still pass before the next beta tag.

Known follow-up:

- Layer rendering now follows graph branch structure for graph-backed
  documents. The first organization UI shows passive graph-area overlays on the
  node canvas and area chips in the flat layer list. Later work can add richer
  folder rows/collapse controls, but folders must stay organizational unless a
  render-order rule is explicitly designed and tested.

### v0.3: Project Memory And Sharing

Goal: make Artifact feel less like a local toy and more like a real creative
workspace.

Current browser-only scope:

- [x] Local project library for named document snapshots.
- [x] Project thumbnails, local open, and local delete controls.
- [x] Existing `.artifact.json` file save/open and `?doc=` share links remain
  the portable interchange path.

Likely VPS/full-stack scope:

- Accounts and login.
- Server-side project saving.
- Server-backed share links.
- Preset database and community preset browsing.
- Project pages, portfolio pages, and case-study pages.
- Server-side asset storage for large uploads.

Do this after the document schema, asset strategy, and export behavior are
stable enough to migrate safely.

### Experimental Track

These ideas are promising but should not block editor reliability:

- Voice/music visualizer nodes using uploaded audio or microphone input.
- Animated noise/effects and possibly video export.
- SVG + 3D hybrid primitives.
- AI image/card generation nodes.
- 3D layer visualization.
- Subscription/paywall experiments.

### Phase 0: Stabilize the current branch

Goal: finish the current node interaction work without adding more behavior.

- [ ] Confirm primitive node viewport clipping inside the node frame.
- [ ] Confirm right-click drag pans the primitive camera and does not open a context menu.
- [ ] Confirm camera lock releases graph gestures.
- [ ] Confirm text/image wheel and drag do not blink or rebuild thumbnails during the gesture.
- [ ] Confirm export uses the same primitive camera state as node/gallery preview.
- [ ] Remove or commit unrelated dirty files before a release branch.

Acceptance criteria:

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npx react-router build`
- Manual verification for text, image, primitive, effect, merge, and export nodes.

### Phase 1: Define state boundaries

Goal: make editor behavior predictable.

- [ ] Write a short `docs/state-model.md` describing document state, graph state, UI state, gesture drafts, and render options.
- [ ] Move primitive camera state ownership into a dedicated hook, for example `usePrimitiveCameraState`.
- [ ] Move text/image transform drafts into a documented hook and make it the only allowed path for node-local transform gestures.
- [ ] Add action names that distinguish `draft`, `commit`, and `document update`.
- [ ] Audit undo history so continuous gestures produce one undo entry.

Recommended ownership model:

| Concern | Owner |
| --- | --- |
| `CanvasDocument` | `useGeneratorDocument` |
| `CanvasGraph` | `useGeneratorDocument` plus graph helpers |
| React Flow selection/menus | `nodeCanvasMachine` |
| Primitive camera view | dedicated camera hook, passed to renderer as `primitiveViewStates` |
| Text/image drag or scale draft | node-local draft hook, committed after gesture |
| Export render options | `useGeneratorExport` |

### Phase 2: Make preview/export parity testable

Goal: prove "what you see is what you export."

- [ ] Extract primitive scene creation into a shared helper used by both `PrimitiveViewport3D` and `primitiveRenderer`.
- [ ] Add renderer fixtures for representative documents:
  - text over fill
  - image free-fit
  - primitive with camera override
  - effect after primitive
  - merge/color graph
- [ ] Add a lightweight pixel comparison test for deterministic Canvas 2D paths.
- [ ] Add an integration smoke test for graph render parity between `renderGraphTarget` and export.
- [ ] Define acceptable tolerance for GPU/WebGL differences.

Important note: exact pixel equality may be unrealistic across WebGL implementations. The test strategy should separate deterministic Canvas paths from GPU-tolerant paths.

### Phase 3: Reduce node editor complexity

Goal: make node editing feel direct, compact, and predictable.

- [ ] Split `NodeCanvas.tsx` into smaller hooks:
  - `useNodeGraphEvents`
  - `useNodeContextMenus`
  - `useNodeSelectionSync`
  - `useNodeGallery`
  - `useNodeDragState`
- [ ] Keep `NodeCanvas.tsx` as composition and provider wiring only.
- [ ] Unify duplicated controls between `Sidebar.tsx` and `LayerInspector.tsx`.
- [ ] Create shared field definitions per layer kind so both inspector surfaces use the same control metadata.
- [ ] Make node-local controls visually distinct from document controls.
- [ ] Document the interaction grammar:
  - left drag over primitive: rotate camera
  - right drag over primitive: pan camera
  - wheel over primitive: zoom camera
  - lock camera: graph gestures pass through
  - wheel over text/image node: scale local content

### Phase 4: Split renderer modules

Goal: keep one render pipeline while making it easier to maintain.

Proposed structure:

```text
app/utils/render/
  canvas.ts              # create/clone/mask helpers
  layers/
    text.ts
    image.ts
    emoji.ts
    fill.ts
    source.ts
    effect.ts
  graph.ts               # renderGraphTarget, graph traversal
  document.ts            # renderDocument entry point
  primitiveScene.ts      # shared Three.js scene recipe
```

Rules:

- `renderDocument` remains the public entry point.
- `renderGraphTarget` remains the graph entry point.
- Preview, thumbnails, gallery, export, and presets must call these entry points.
- No duplicate preview-only renderer unless it is explicitly marked as a draft approximation.

### Phase 5: Performance and thumbnail architecture

Goal: keep the node editor responsive as documents grow.

- [ ] Replace object-identity thumbnail revisions with content signatures per node.
- [ ] Split signatures by render-relevant fields, not whole object replacement.
- [ ] Cancel or collapse queued thumbnail renders when newer work supersedes them.
- [ ] Consider `OffscreenCanvas` for supported browsers.
- [ ] Add a debug overlay or dev-only logging for render invalidation causes.
- [ ] Budget thumbnail queue work separately from main preview/export work.

Useful target behavior:

- Gesture drafts update instantly without thumbnail work.
- Commit triggers one thumbnail render for affected downstream nodes.
- Upstream-only changes invalidate downstream nodes, not unrelated nodes.

### Phase 6: Persistence, sharing, and assets

Goal: make documents portable and safe for real use.

- [ ] Move large image blobs out of `CanvasDocument` data URLs where possible.
- [ ] Add IndexedDB asset storage for local projects.
- [x] Add document import/export as a `.artifact.json` file.
- [ ] Add share links that separate document JSON from binary assets.
- [ ] Define a versioned document schema and migration tests.
- [ ] Decide whether cloud persistence belongs in this product or stays out of scope.

### Phase 7: Accessibility and input coverage

Goal: keep the tool usable across devices and input methods.

- [ ] Define keyboard equivalents for node-local transform and primitive camera controls.
- [ ] Ensure all node buttons meet 44px touch target rules or have a touch-specific layout.
- [ ] Ensure `prefers-reduced-motion` covers node editor transitions.
- [ ] Audit focus order in the node canvas, add menu, context menus, gallery, and inspector.
- [ ] Add pointer interaction tests for context-menu edge cases where possible.

### Phase 8: Documentation cleanup

Goal: align public docs with the current product.

- [x] Update `README.md` to include procedural layers, node graph mode, primitive camera state, and graph export.
- [x] Add `docs/state-model.md`.
- [x] Add `docs/rendering.md`.
- [x] Add `docs/node-editor.md`.
- [x] Add `docs/testing.md`.
- [ ] Keep `PRODUCT.md` and `DESIGN.md` as product/design source of truth, not implementation docs.

## Recommended near-term focus

The next engineering pass should focus on state boundaries and render parity before adding more node types or effects. Most recent bugs came from unclear ownership between document state, transient view state, and interactive gesture state. Fixing that foundation will make every future UI improvement cheaper.

Recommended order:

1. Extract document history/update modes.
2. Add document-sync tests for undo/redo, import, and graph persistence.
3. Add render parity fixtures.
4. Split renderer internals behind the existing public entry points.
5. Finish shared sidebar/inspector controls.
6. Add a versioned document schema before the next persisted-shape change.

## Non-goals for now

- Do not add backend persistence until the local document schema and asset strategy are stable.
- Do not add more effect parameters until the effect update checklist is automated or tested.
- Do not make a second preview renderer for speed unless it is clearly labeled as draft-only.
- Do not duplicate node controls in both sidebar and inspector without shared field definitions.

## Health summary

The codebase is productive and already has a strong core: portable documents, deterministic rendering, GPU effects, node graph editing, and a clear visual identity. The main weakness is not lack of features. The main weakness is that interactions and render invalidation are spread across too many components without a written contract.

The best path forward is architectural consolidation: make state ownership explicit, keep one rendering truth, and prove preview/export parity with tests.
