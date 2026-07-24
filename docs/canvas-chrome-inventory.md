# Canvas Chrome Inventory

Status: locked for v0.47 on 2026-07-24. This is the C1 contract for
[issue #167](https://github.com/shchilkin/artifact/issues/167). The canonical
machine-readable inventory lives in
`apps/web/app/components/canvas-chrome/canvasChromeInventory.ts`; this document
is its human-readable projection. The style-guide specimens consume the
canonical arrays for their surface, state, and invariant summaries, while the
unit test keeps an independent fixed manifest so an omitted state fails review.

Canvas Chrome is the Artifact Design System around graph structure, rendered
previews, direct manipulation, galleries, and 3D viewports. It may make state
legible, but it does not own document, graph, renderer, export, geometry, cache,
or camera semantics.

Downstream issues #172-#176 must use this closed inventory. A newly discovered
visible state is a contract change: add it here and to the typed inventory
before styling it. Do not silently absorb graph or renderer behavior into a
visual migration.

## Surface ownership

| Surface | Visible states | Artifact mapping | Owner |
| --- | --- | --- | --- |
| Graph viewport | resting grid; empty graph; pan/zoom controls; React Flow attribution; selection marquee; node alignment guides; Add Library drag idle/canvas-ready/edge-ready/invalid; pane/node/edge menus; toolbar default/hover/focus/pressed/disabled; area create/add action; account loading/signed-out/signed-in action; preview queue status; performance metrics overlay | workspace surface; `EmptyState`; required vendor attribution; compact toolbar controls and command variants; selection/alignment lines; editor drop-target and danger feedback; editor overlay; compact progress and debug overlays | #173 |
| Graph areas | default; selected; collapsed; empty; non-interactive while dragging; organization tint | editor organization group, summary, empty, selection, and dragging states | #173 |
| Node housings | default; hover; focus; selected; dragging; muted/hidden; locked/delete-disabled; output path; thumbnail loading/ready/failed; existing AI loading/error/current/history | `NodeShell`; `NodeFrame`; Artifact focus and selection; `PreviewFrame`; feedback and `Badge` patterns | #172 |
| Edges and ports | default; selected; output path; valid insertion; invalid connection; disconnected/connected/connecting port; keyboard focus | Artifact graph lines; selection/output contrast; editor drop/danger feedback; `NodeFrame` port and focus states | #172 |
| `CanvasPreview` | opaque; transparent; empty; error; recovery; selected/locked/hidden handles; document/file/image drop; pointer/keyboard manipulation | Artifact preview frame; checkerboard UI chrome; canvas empty/error/recovery; selection handles; editor drop-target; direct-manipulation focus/active states | #174 |
| Node thumbnails and `NodeGalleryCanvas` | loading; ready; failed; selected; gallery open; narrow; keyboard focus; pan/zoom active; transform handles | `PreviewFrame`; editor overlay/mobile sheet; interactive viewport; canvas selection handles | #175 |
| `PrimitiveViewport3D` | loading; ready/passive; active/unlocked; hover ownership; keyboard focus; locked pass-through; reset; WebGL unavailable; node/modal size | `PreviewFrame`; Artifact interactive/locked viewport; compact toolbar; preview error/recovery | #176 |
| Scene/model/environment 3D workspaces | loading; ready; active; locked; missing model/environment; environment ready; camera reset | shared Artifact 3D preview, interactive/locked viewport, error/recovery, and compact toolbar grammar | #176 |

Every visible state above is an Artifact pattern. The following pixels and
geometry are approved non-goals rather than missing visual states:

- document, node-thumbnail, gallery, primitive, model, environment, and scene
  renderer pixels;
- React Flow node positions, edge routing, port coordinates, traversal order,
  connection validation, and graph-area semantics;
- exported pixels and dimensions;
- pointer-to-document coordinate conversion, handle math, graph drop placement,
  pan, zoom, and camera calculations;
- render signatures, render-session cache keys, queue priority, and cache
  eviction.

## Reduced reference specimens

`/docs/style-guide` owns four deterministic fixtures. They use local markup and
CSS instead of live Canvas 2D, React Flow orchestration, async thumbnail work,
or WebGL, so a chrome regression does not masquerade as a renderer timing
failure.

| Specimen | Required reference states | Runtime behavior seam |
| --- | --- | --- |
| `NodeCanvas` | grid, area, selected node, output path, connected port, alignment guide, toolbar pressed/disabled/account variants, Add Library drag idle/canvas-ready/edge-ready, preview queue/performance overlay | existing node-editor browser, graph-helper, and performance suites |
| `CanvasPreview` | transparent frame, selected handles, image drop, error, recovery | existing preview/render and direct-manipulation browser suites |
| `NodeGalleryCanvas` | ready, selected, keyboard focus, deterministic loading and failure anatomy, reduced narrow composition | existing gallery render and viewport interaction tests |
| `PrimitiveViewport3D` | active, locked, reset, keyboard focus, WebGL unavailable | existing primitive camera, event-isolation, and fallback tests |

These fixtures are visual reference surfaces, not alternate implementations of
the named runtime components. They must remain deterministic, responsive, and
free of network assets, local persistence, renderer work, and WebGL.

## Semantic invariants

### CanvasDocument

`CanvasDocument` remains the serialized JSON-only source of truth. Chrome may
read state and invoke existing document commands; it must not persist DOM
nodes, Canvas 2D objects, WebGL/Three objects, decoded images, caches, gesture
objects, or visual-only specimen state.

### Graph mutation and traversal

Connections, edge insertion/removal, cycle validation, traversal, output-path
resolution, and organization continue through the existing graph helpers.
Graph areas remain non-rendering organization metadata. Canvas Chrome must not
change render order or connection validity.

### Renderer entry points

`CanvasPreview`, thumbnails, gallery, primitive previews, and export retain
their current canonical renderer paths. Chrome wraps a result; it does not
replace `renderDocument`, `renderGraphTarget`, or the existing Three.js scene
renderers.

### Render signatures and caches

Every pixel-affecting input remains in the relevant signature and transient
cache key. Pure chrome state is excluded unless it intentionally changes
rendered pixels. Canvas and promise caches remain outside `CanvasDocument`.

### Export

Export renders directly from the canonical document plus the same live
primitive camera state used by preview. Checkerboards, borders, handles,
selection, menus, focus rings, loading states, and drop overlays never enter
export pixels.

### Pointer geometry

Canvas and gallery gestures continue to use document-space geometry and the
current preview dimensions. New borders, padding, responsive layout, or frame
components must not move the coordinate frame used by handles, canvas drop,
pan, zoom, or node placement.

### Camera ownership

Primitive and scene camera drafts remain node-local during gestures and commit
through the existing viewport-state callbacks. Unlocked viewports retain their
event isolation; locked viewports pass graph pan/zoom gestures back to React
Flow. Camera state stays in render options and
`CanvasGraph.primitiveViewStates`, never in visual chrome.

## Validation boundary

The reduced fixtures prove deterministic presence, responsive containment,
semantic state identifiers, and keyboard focus. Runtime behavior remains at its
existing public seams. Downstream migrations must run the focused tests for
their surface, the v0.47 browser gate, and `npm run perf:node-editor` when they
touch React Flow, thumbnail scheduling, live previews, or 3D interaction.
