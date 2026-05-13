# Rendering Architecture

This document explains how Artifact turns a `CanvasDocument` into pixels and how preview/export parity should be protected.

## Rendering promise

The same document, graph, image cache, and primitive camera state should produce the same composition everywhere:

- main preview
- node thumbnail
- node gallery
- preset thumbnail
- export

Size and antialiasing can differ, especially with WebGL, but the render path and source state should not.

Node previews use `app/components/node-canvas/thumbnails/previewSizing.ts` to
derive both CSS display size and internal render size from `doc.global.aspect`.
Use that helper for new thumbnail-like surfaces so `16:9`, `9:16`, `4:5`, and
`1:1` documents keep the same composition shape across nodes and export.

The layer preview still uses `getPreviewDims(...)` for its CSS geometry, but
`useDocumentRenderer` can render above that display size through
`renderScale` / `maxRenderDimension` and downsample into the same visible
canvas. Use that path when improving layer-preview/export parity without
changing pointer math or handle coordinates.

Transparent document backgrounds must stay transparent in renderer output and
exports. UI preview surfaces may show a checkerboard behind the canvas to make
alpha visible, but the checkerboard is interface chrome and must not be drawn
into document pixels.

## Public entry points

| Function | File | Use |
| --- | --- | --- |
| `renderDocument` | `app/utils/renderer.ts` | Main document render entry. Chooses stack or graph mode. |
| `renderGraphTarget` | `app/utils/renderer.ts` | Renders a specific node target through graph traversal. |
| `renderPrimitiveToCanvas` | `app/utils/primitiveRenderer.ts` | One-shot Three.js primitive render for document/export pipeline. |
| `generateThumbnail` | `app/utils/generateThumbnail.ts` | Preset/example thumbnail generation. |

Rule:

> UI surfaces may wrap these functions, but they should not reimplement artwork rendering.

`app/utils/renderer.ts` is the stable caller-facing facade. Renderer internals
live under `app/utils/render/`; app code should keep importing the public entry
points from the facade unless it is working inside the renderer itself.

## Document render flow

High-level flow:

1. Determine output dimensions.
2. Create a canvas.
3. Draw the background.
4. Resolve graph target or layer order.
5. Apply each layer/source/effect.
6. Return a canvas.

The renderer uses a `REF = 540` scale baseline. Authored pixel-like values are interpreted at 540px and scaled by `W / 540`.

## Stack mode vs graph mode

### Stack mode

Stack mode renders `doc.layers` in order. Index 0 is bottom. This is the classic layer editor mental model.

### Graph mode

Graph mode renders from `CanvasDocument.graph`. Nodes can be:

- layer nodes
- merge nodes
- color nodes
- export node

`renderGraphTarget` recursively renders upstream dependencies and composes the result.

### Rule

If `doc.graph` exists and `graphMode` is not forced to `stack`, graph mode is used. Preview and export call sites must be explicit about which mode they need.

## Layer rendering

Layer rendering happens through `applyLayerToCanvas` in `renderer.ts`.

| Layer kind | Renderer |
| --- | --- |
| `emoji` | Canvas 2D seeded scatter |
| `text` | Canvas 2D text with transform, opacity, blend |
| `image` | Canvas 2D image fit/transform |
| `fill` | Canvas 2D fill |
| `primitive` | Three.js offscreen render, then Canvas 2D composite |
| `noise` | Canvas procedural source |
| `array` | Canvas procedural source |
| `effect` | Canvas effects plus PixiJS GPU filters |

Primitive layers are rendered as frame-fitted sources in both stack and graph paths. Their old document placement fields may still exist for compatibility, but the UI no longer exposes primitive placement controls; camera and framing are handled by the primitive viewport state instead.

When `draft` rendering is requested, primitive layers may use a Canvas 2D fallback shape instead of creating a new offscreen WebGL renderer. This keeps the live layer preview responsive after GPU/context loss without changing the canonical export path.

## Effect rendering

Effect layers are non-destructive passes over everything below them.
New documents should use focused one-effect preset layers. Legacy combined
effect layers are migrated into separate focused layers during document
normalization.

Pipeline:

1. Clone current canvas.
2. Apply Canvas 2D effects.
3. Build Pixi filters from effect parameters.
4. Run GPU pass if filters exist.
5. Apply alpha mask if enabled.

Rules:

- Effect params must be initialized in defaults, presets, randomizer, renderer, and controls.
- GPU effects should use normalized coordinates where possible.
- If an effect depends on output size, pass dimensions explicitly.

## Primitive rendering

Primitive rendering has two surfaces:

| Surface | File | Purpose |
| --- | --- | --- |
| Live viewport | `app/components/PrimitiveViewport3D.tsx` | Interactive node/gallery camera control. |
| Offscreen render | `app/utils/primitiveRenderer.ts` | Export/document render. |

Both must share the same scene recipe:

- geometry
- material
- lights
- shadow
- camera position
- mesh rotation
- color handling

Current risk:

- The scene recipe is still duplicated. It should be extracted into a shared `primitiveScene` helper.

Primitive camera state comes from `RenderOptions.primitiveViewStates`.

If no override exists, the fallback comes from layer defaults:

- `tiltX`
- `tiltY`
- `tiltZ`
- zoom `1`
- pan `0, 0`

Important rule:

> Interactive primitive camera rotation should not write back into `tiltX/tiltY`. Those fields are durable defaults, not the live camera.

## Node thumbnails

Node thumbnails are rendered by `NodeThumbnail`.

The thumbnail system:

- collects upstream node ids
- tracks revisions
- debounces rendering
- caches recent canvases
- preloads missing images
- calls `renderGraphTarget` or `renderDocument`

Risks:

- Current invalidation is based on object identity revisions.
- High-frequency document writes can trigger thumbnail rerenders.
- Local gesture drafts must not touch document state until commit.

Future target:

- content-based signatures
- invalidation reason logging
- one render after gesture commit
- downstream-only invalidation

## Live selected-node overlays

Some selected node previews can use live overlays for responsiveness.

Examples:

- text/image transform draft overlay
- live primitive WebGL viewport

Rules:

- Live overlays are interaction surfaces, not canonical renderers.
- They should mirror the canonical renderer closely.
- They must commit to document/render options before export if they affect output.
- If visual parity is not exact, the difference must be documented as draft-only.

## Render options

Current render options:

```ts
interface RenderOptions {
  skipEffects?: boolean;
  draft?: boolean;
  graphMode?: 'auto' | 'graph' | 'stack';
  primitiveViewStates?: Record<string, PrimitiveViewportState>;
  effectResolution?: { width: number; height: number };
}
```

Guidelines:

- `skipEffects` is for performance-sensitive preview paths only.
- `draft` may lower quality during active interaction.
- `graphMode` must be explicit when a surface needs stack behavior.
- `primitiveViewStates` must be passed to export when primitive camera state is visible in preview.
- `effectResolution` is used by export so scale 2/3 increases file
  resolution without changing procedural effect density from the base cover
  size.
- UI render hooks should avoid painting stale async results when a newer
  document, image-cache, or render-option change is already queued.

## Preview/export parity checklist

For any rendering change, verify:

1. Main layer preview still renders.
2. Node thumbnail still renders.
3. Node gallery still renders.
4. Export uses the same graph or stack mode as the visible editor mode.
5. Primitive camera overrides are passed to export.
6. Image cache is available before rendering.
7. Pixel-like values scale from the 540 baseline.
8. Effects do not depend on preview-only dimensions unless intended.

## Suggested test fixtures

Start with deterministic fixtures:

- fill only
- text over fill
- image free-fit over fill
- seeded emoji layer
- stack with effect disabled

Then add graph fixtures:

- primitive source into export
- primitive with camera override
- text/image over primitive background
- merge node
- color node
- effect after merge

Test strategy:

- Canvas-only fixtures can use strict or near-strict pixel comparison.
- GPU/Pixi/Three fixtures should start as smoke tests.
- Add tolerant pixel diff only if CI environments are stable enough.

## Do not do this

- Do not add a second "almost real" renderer for previews.
- Do not make export use layer fields that preview ignores.
- Do not make preview use transient state that export cannot receive.
- Do not let thumbnails render from stale image or primitive camera state.
- Do not optimize by bypassing `renderDocument` unless the path is explicitly draft-only.

## Target module split

Long-term shape:

```text
app/utils/render/
  canvas.ts
  document.ts
  graph.ts
  layers/
    text.ts
    image.ts
    emoji.ts
    fill.ts
    source.ts
    effect.ts
  primitiveScene.ts
```

The split should reduce file size and improve testability without changing the public entry points.

Current implementation status:

- `app/utils/renderer.ts` re-exports the public facade.
- `app/utils/render/canvas.ts` owns shared Canvas 2D helpers.
- `app/utils/render/graph.ts` owns graph traversal rendering.
- `app/utils/render/layers/index.ts` owns layer/effect passes while the
  remaining per-kind files are extracted.
- Per-kind layer/effect files should be introduced incrementally only when they
  reduce complexity, guarded by render parity fixtures.
