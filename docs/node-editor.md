# Node Editor

This document describes the node editor architecture and interaction grammar.

## Purpose

The node editor is a visual composition surface over the same `CanvasDocument` used by the layer editor. It should feel direct: select a node, adjust the thing inside it, and connect it to other nodes without fighting graph pan/zoom.

The node editor should not become a second document model.

## Main files

| Area | Files |
| --- | --- |
| Shell | `apps/web/app/components/node-canvas/NodeCanvas.tsx` |
| State machine | `apps/web/app/components/node-canvas/machine.ts` |
| Context | `apps/web/app/components/node-canvas/context.ts` |
| Node construction | `apps/web/app/components/node-canvas/buildRFNodes.ts` |
| Node components | `apps/web/app/components/node-canvas/nodes/NodeTypes.tsx`, `NodeShell.tsx` |
| Node previews | `apps/web/app/components/node-canvas/thumbnails/*` |
| Inspectors | `apps/web/app/components/node-canvas/inspector/*`, `panel/NodePropertiesPanel.tsx` |
| Menus | `apps/web/app/components/node-canvas/menus/*` |
| Graph helpers | `apps/web/app/utils/nodeGraph.ts` |

## Architecture overview

`NodeCanvas` receives the canonical document and callbacks from `editor.tsx`.

It derives:

- graph
- connected ports
- React Flow nodes
- React Flow edges
- node selection state
- primitive camera state
- gallery state

Then it provides:

- `NodeCanvasPreviewContext`: read-only render inputs for thumbnails/previews
- `NodeCanvasActionsContext`: actions for selection, updates, deletion, gallery, primitive camera

The editor route treats node mode as a full-canvas workspace: navigation,
mode switching, graph actions, and export/preset actions float over the canvas.
Node properties dock in a dedicated right rail on desktop and collapse to a
bottom drawer on smaller screens.

## State machine

`nodeCanvasMachine` owns UI state for:

- selected node ids
- selected edge id
- expanded node id
- context menu state
- gallery node id

Rules:

- Selection and overlays are editor state, not document state.
- The machine should not own render data.
- Document mutations should happen through `useEditorDocument` callbacks.
- High-frequency drag state stays in React Flow shadow nodes until drag stop.
  React Flow measurement changes are accepted when they are real, duplicate
  dimension changes are ignored, and identical selection events are skipped to
  avoid document-independent render loops while dragging.

## Node types

Current React Flow node types:

| Type | Purpose |
| --- | --- |
| `layerNode` | Wraps any document layer. |
| `mergeNode` | Combines two upstream inputs. |
| `colorNode` | Applies non-layer color adjustment. |
| `repeatNode` | Repeats any upstream source branch over an optional backdrop. |
| `maskNode` | Cuts one source branch with a matte source. |
| `transformNode` | Moves, scales, rotates, or fades an upstream branch. |
| `grimeShadowNode` | Builds a layered dirty shadow from upstream alpha. |
| `materialNode` | Defines a reusable 3D material and texture-map inputs. |
| `shaderNode` | Generates one procedural raster shader source or processes a connected backdrop (`Shader Fill` / `Shader Effect` / `AI Shader Effect` in the UI). |
| `environmentNode` | Provides an environment map source for 3D scene lighting. |
| `scene3dNode` | Renders a 3D scene from model, material, lighting, environment, and backdrop inputs. |
| `exportNode` | Terminal output target. |

Layer nodes map to `CanvasDocument.layers`. Graph-only utility, material,
shader, environment, scene, and export nodes live in `CanvasGraph`.

### Single-purpose node contract

Nodes should have one primary reason to exist. A node may expose presets or
variants when they are different flavors of the same role, but it should not
silently combine unrelated roles.

Use these boundaries:

- **Source nodes** create pixels or assets: image, fill, noise, array, line
  field, primitive/model source, shader fill, environment map.
- **Process nodes** transform one upstream branch: effect, color, transform,
  mask, grime shadow.
- **Combine nodes** join multiple branches: merge and repeat-over-backdrop.
- **Resource nodes** describe reusable non-image data for another node:
  material and environment.
- **Scene nodes** render a domain object from explicit inputs: 3D Scene owns
  camera, lighting, scene material mode, environment strength, and backdrop
  composition.
- **Output nodes** define a render target and export path.

When a node starts needing controls from two roles, split the roles instead of
adding another mode. For example, a shader fill node may switch between mesh,
marble, liquid, noise, water-surface, or tileable texture algorithms because
each still produces one texture source. It should not also own 3D lighting,
material scalar controls, export settings, or input-dependent image
transforms. Those belong to Material, 3D Scene, Output, and Effect nodes.

Exceptions must be explicit in docs and tests. A temporary MVP shortcut is
acceptable only when it preserves serialized state clarity, render/export
parity, and a clear migration path to separate nodes.

### Shader definition, instance, and material boundary

Shader work follows the same single-purpose split:

- A **Shader Definition** is a serializable shader program with a property
  manifest. A **Shader Instance** is a graph node using that definition with its
  own property values and one explicit role (`fill` or `effect`). Definitions
  may be authored from a built-in preset, code, or AI; those authoring methods
  do not create additional runtime roles.
- Shader roles never depend on connection state. A **Shader Fill** has no image
  input and creates its own pixels. A **Shader Effect** requires one source
  input and renders transparent when that input is missing.
- The first definition-backed runtime supports number, boolean, and color
  properties. Each property maps to a stable `u_prop_<key>` uniform and the
  inspector is generated from the manifest rather than hard-coded sections.
- Code Shader nodes persist a Shader Definition and instance values. Older
  development documents with `customShaderCode` are normalized once into this
  model and no longer retain the old field.

- **Shader Fill / Effect** nodes are procedural raster shaders. Preset
  shader fills generate pixels from their own parameters and document seed,
  expose their output as a source texture, and do not require an upstream image.
  Their colors are stored as an ordered `palette` array; each preset declares
  how many colors it starts with and whether the user can add more.
  The preset inspector exposes only shape and placement fields read by the
  selected renderer; shared grain/variation controls remain available for
  texture output, while irrelevant controls stay hidden.
  When explicitly set to Effect, they sample the required upstream
  branch as input texture data, use its luminance/detail to shape the generated
  shader, and then apply the node's opacity and blend mode as pass intensity.
  Opacity and blend mode are effect-only controls; fill mode outputs the generated
  texture directly.
  `AI Shader Effect` is prompt-ready and input-dependent: it stores a validated
  `customSpec` JSON shader description and prompt provenance, not raw
  GLSL/WGSL. Its inspector can generate an editable spec from a prompt through
  the AI shader-spec endpoint. The default path must request the configured
  OpenAI provider; if that fails, the inspector may offer a separate local
  deterministic fallback, and the saved spec must keep `localFallback`
  provenance. Prompts allow up to 1500 characters; the inspector shows the
  current count and the API rejects oversized prompts instead of silently
  truncating them. The v2 spec grammar supports source-aware pass operations such as
  source luminance, edge glow, chromatic shift, and gradient-map tinting in
  addition to procedural noise/waves/rings. Saved operations execute in order,
  so the spec is an editable render recipe rather than an unordered set of
  effect amounts. Its inspector is split into Prompt, Tone, Colors, and ordered
  Steps; preset-only shape, placement, and texture controls are not reused.
  Without a connected source/backdrop,
  or before a generated spec exists, it renders transparent instead of inventing
  source pixels.
  `Code Shader` is a shader authoring method: its definition stores a GLSL
  fragment body that defines `mainImage(vec2 uv)` and receives
  `u_backdrop`, `u_resolution`, `u_seed`, `u_strength`, and
  `u_has_backdrop` from the renderer.
  Its inspector exposes manifest-defined controls plus Strength and Variation
  only when the code reads the matching built-in uniform; an empty shader has
  no inherited preset controls and stays transparent.
  Its explicit role decides whether it generates a standalone texture or
  processes a required `backdrop` branch. It must stay a shader node,
  not a place for JavaScript, network access, material controls, or 3D scene
  controls.
- Built-in image transforms such as dithering, blur, and refraction remain
  **Effect** nodes. Like Shader Effects, they require an upstream source branch;
  unlike authored Shader Effects, their program and controls are maintained by
  Artifact.
- **Material** nodes describe PBR surface parameters and texture-map inputs:
  `albedo`, `roughness`, `metalness`, `normal`, and `alpha`.
- **Primitive** and **3D Scene** nodes consume a material or texture source while
  keeping model, camera, view, lighting, and composition controls separate from
  material authoring.

Material texture-map ports may receive either a Shader Fill output directly or
the output of an input-dependent Shader Effect / AI Shader Effect branch. The
latter is valid only when the pass has an upstream source. This keeps the graph
readable: `Shader Fill -> Material.albedo -> Primitive.material -> Output` for
standalone textures, `Source -> Shader Effect -> Output` when a preset
procedural shader transforms an image branch, or `Source -> AI Shader Effect
-> Material.normal -> Primitive.material -> Output` when the map is derived from
existing pixels.

The Add Node library should keep this taxonomy visible:

- **Sources** for imported/generated image branches and text/pattern bases.
- **Shader Fills** for standalone procedural texture sources.
- **Shader Effects** for input-dependent shader transforms such as `AI Shader Effect`.
- **Effects** for input-dependent image transforms, even when browse sections
  further split them by tone, warp, print, light, signal, texture, or graphic
  family.
- **Materials** for reusable PBR surface nodes and texture-map ports.
- **3D / Primitive** for primitive/model source nodes, scene renderers, and
  environment-map resources.
- **Output** for the fixed graph terminal/export target. It is not currently an
  add-library item because each graph owns one canonical output node.

The `Shader Material` Add Node recipe is the canonical starter for the material
bridge: it surfaces Shader Fill, Material, Primitive, and input-dependent shader
effect nodes together while keeping the actual connections explicit in the
graph.

The v0.13 `AI Image` add-menu entry is intentionally layer-backed: it creates a
normal image layer node named `AI Image`, then the image-node properties panel
can generate or replace its `src` through the account-gated AI workflow. This is
not a new serialized layer kind. Generations can attach lightweight
serializable `aiGeneration` provenance to the image layer so the prompt, current
job status, and failure reason remain visible with the image/card. Successful
generated variants can be kept in `aiGenerationHistory` as lightweight image
source/provenance pairs, and selecting a previous/next variant updates the
normal image layer `src`. Heavy queue records, provider responses, blobs, and
decoded images stay outside `CanvasDocument`.

Graph areas/groups live in `CanvasGraph.areas`. They are serializable
organization metadata for dense workflows; they should help the layer list and
node canvas explain structure, but they must not change rendering or traversal
until a dedicated render rule is designed and tested.

The first area UI is intentionally passive: the node canvas draws area overlays
around assigned nodes, and the layer panel groups layer-backed members under
collapsible area folder rows. Area folders may batch-toggle visibility for
their layer-backed members. Graph-only members inside an area appear as
read-only helper rows, not as stack layers. Folder collapse is local UI state;
creating an area from selected nodes, or from selected layer rows in the Layers
panel, stores only node ids, name, color, and collapsed metadata. Layer rows can
be multi-selected to create a new area or added to an existing area from the
selection action bar or row context menu. Area membership can be removed either
by dragging a single member outside the area, through the node context menu,
through the Layers row context menu, or from graph-helper rows inside an area
folder. Area names can be edited from the Layers folder row, and an area can be
ungrouped without deleting its member nodes. Areas do not own React Flow nodes,
do not make node positions relative, and do not affect render order.

Area membership is exclusive. A node belongs to at most one area in the current
editor model; adding a node to another area removes it from the previous one.
Selecting an existing area and nodes extends that area instead of creating a
stacked area over the same nodes. Nested areas/folders are a future design slice,
not current behavior. Dragging one member away from the rest of an area removes
that member from the area; dragging the whole area contents together keeps the
membership intact. If remaining area members are no longer visually contiguous,
the node canvas may draw the same area as multiple outlined segments so detached
nodes in between are not visually claimed by the area.

## Interaction grammar

### Global graph gestures

| Gesture | Behavior |
| --- | --- |
| Drag empty canvas | Pan graph |
| Wheel empty canvas | Zoom graph |
| Drag node header/body outside local controls | Move node |
| Connect handles | Create graph edge |
| Drop a handle connection on empty canvas | Open add menu; selected node is connected to the dragged handle |
| Toolbar Add Node | Open add menu; created node appears at the menu/button anchor in graph space |
| Drag Add Library item onto edge | Highlight the edge and split it with the dropped node |
| Toolbar Path | Fit the viewport to the graph nodes that feed the output |
| Toolbar Output | Center the viewport on the output node |
| Right-click graph | Open pane add menu |
| Right-click node shell | Open node context menu |
| `M` with layer nodes selected | Mute/unmute selected layer nodes by toggling visibility |

### Guardrails

Layer-backed nodes inherit the layer `locked` guardrail from the canonical
document. A locked layer-backed node cannot be deleted from the node canvas or
node context menu, but it can still be selected, moved on the graph, muted,
renamed, and edited through the shared inspector controls. Locking is an editor
safety rail, not a traversal or render rule.

Graph-only merge, color, repeat, and output nodes do not have durable lock state
in v0.28. The properties panel should describe them as graph-only utility or
output targets instead of showing a fake lock toggle.

### Text and image nodes

| Gesture | Behavior |
| --- | --- |
| Select node | Show local transform overlay |
| Drag preview | Move content inside node |
| Shift-drag preview | Rotate content |
| Wheel selected node | Scale content |
| Gesture end or wheel idle | Commit one document update |

Rules:

- Text/image gestures update local draft state first.
- Document state updates after the gesture, not on every tick.
- Draft interaction must not cause thumbnail rerenders.
- Once a selected text/image transform gesture starts, keep the interactive
  live surface mounted until the node is no longer selected. Do not switch back
  to thumbnail mode at the same moment the committed document update invalidates
  thumbnails.

### Primitive nodes

| Gesture | Behavior |
| --- | --- |
| Left drag viewport | Rotate primitive camera |
| Right drag viewport | Pan primitive camera |
| Wheel/trackpad viewport | Zoom primitive camera |
| Lock camera | Disable local camera gestures, allow graph gestures |
| Reset camera | Return to default camera while preserving lock state |
| Right-click inside viewport | Do not open node context menu |

Rules:

- Primitive camera state is not `tiltX/tiltY`.
- `tiltZ` remains durable object spin.
- Material color and light color changes must not reset primitive camera state.
- Shape, depth, and spin changes must reapply the current camera transform after the mesh is rebuilt.
- The primitive scene should not add a built-in cast shadow; shadows are a separate effect/compositing concern.
- Camera controls belong in the node, not in the global scene.
- Primitive viewport must be clipped to the node preview frame.
- Export receives the same primitive camera state as preview.

## Event isolation rules

Node-local controls must isolate pointer and wheel events from React Flow when active.

Use:

- `nodrag` to prevent node dragging.
- `nopan` to prevent graph panning.
- `nowheel` to prevent graph zooming.
- explicit `stopPropagation` / `preventDefault` for native listeners where React Flow captures too early.

Do not isolate events when the interaction should pass through to the graph, for example a locked primitive camera.

### Text/image vs React Flow wheel isolation

Text/image wheel scaling and primitive camera zoom both happen inside custom
React Flow nodes, but they should not share one global listener.

Rules:

- Text/image scale wheel handling should be scoped to the selected preview root.
- Primitive 3D may use document/window capture plus the React Flow pane hover
  lock because it owns a live WebGL viewport and needs to receive events before
  d3-zoom.
- Do not add a broad document/window wheel listener for text/image previews. It
  can steal or reorder events that the primitive viewport expects.
- Verify wheel gestures do not change the React Flow viewport transform when
  the pointer is over an unlocked selected preview.
- Verify graph wheel zoom still works on empty canvas and over locked primitive
  viewports.

## Context menu edge cases

Right-click is both a common context-menu gesture and a useful camera pan gesture.

Rules:

- Right-click on graph background opens the pane menu.
- Right-click on ordinary node shell opens the node menu.
- Right-click inside primitive viewport starts camera pan.
- Context menu must be prevented inside primitive viewport while camera is unlocked.
- Camera controls inside the node strip must not trigger viewport drag or graph menu.

## Node-local vs document controls

Node-local controls manipulate view or gesture state. Side panels manipulate durable document parameters.

Examples:

| Control | Belongs in node | Belongs in inspector/sidebar |
| --- | --- | --- |
| Primitive camera rotate/pan/zoom | Yes | No |
| Primitive camera lock/reset | Yes | No |
| Primitive shape/depth/shading | No | Yes |
| Text/image transform gesture | Yes | Durable values visible in inspector |
| Text content/font/color | No | Yes |
| AI image generation prompt | No | Yes, account-gated image-node properties |
| Effect parameters | No | Yes |
| Emoji scatter density/size/set | No | Yes |
| Emoji blur/trails/distortion | No | Dedicated effect node |
| Noise placement | No | No; noise is a full-frame source |

This avoids split-brain control where a side slider fights a direct manipulation surface.

## Preview surfaces

Node previews have two modes:

1. **Thumbnail mode:** async cached render from canonical renderer.
2. **Interactive selected mode:** live overlay/viewport over a stable background.

Rules:

- Thumbnail mode is for non-selected or passive display.
- Interactive mode is for direct manipulation.
- Interactive mode must commit back to document/render options.
- Interactive mode should stay visually close to canonical renderer.
- Interactive mode should be visually stable across commit boundaries. A local
  gesture commit invalidates the canonical thumbnail; the UI must not briefly
  replace the live surface with a stale canvas, skeleton, or preparing state
  while that new thumbnail is rendering.
- Node cards may size by content type; avoid assumptions that every node is the
  same fixed width.
- Thumbnail rendering should keep the last good frame during graph drag
  gestures. Dragging a node should move the node shell, not restart expensive
  render work inside every preview.
- Only selected node previews should be urgent during edits. Output/export
  thumbnails can render at higher quality when selected, but otherwise they
  should stay passive so a control change does not redraw the whole graph on the
  critical interaction path.

### Regression note: image transform flicker

The selected image-node flicker regression came from a race between two valid
render surfaces:

- the live DOM overlay used during selected-node transform gestures
- the async canonical `NodeThumbnail` canvas used for passive previews

Wheel scaling updated local draft state, then committed `scaleX/scaleY` to the
document after wheel idle. That commit changed the thumbnail render signature
and kicked off async thumbnail work. If the live overlay was unmounted as soon
as the draft matched the committed layer, the user saw the node swap from live
overlay to a stale/empty thumbnail frame while the new thumbnail was still
rendering.

Two secondary issues made the swap more visible:

- generated/imported images may be stored as `artifact-asset://...`; a live
  `<img>` cannot render that URI until it is resolved to a cached browser image
  or portable data URL
- global image CSS can cap intrinsic `<img>` dimensions; free-fit live images
  must opt out with `max-width: none` / `max-height: none` so DOM overlay scale
  matches the Canvas 2D renderer

The fix is:

- keep transform state local during the gesture and commit after wheel idle or
  pointer-up
- activate the live transform surface from the actual gesture handler, not from
  an effect that mirrors state
- keep the live transform surface mounted while the node remains selected after
  the first transform gesture
- resolve `artifact-asset://...` image sources before passing them to live DOM
  image overlays
- keep wheel interception scoped to the selected preview root so primitive 3D
  camera controls keep their own event path

When this class of bug returns, inspect the DOM during the gesture. A selected
image node should keep `.node-live-media-overlay` mounted and should not show
`.node-thumbnail-skeleton` or `Preparing` while the pointer is still editing
that node.

## Recommended refactor target

`NodeCanvas.tsx` should become composition, not orchestration.

Extract:

- `useNodeSelectionSync`
- `useNodeContextMenus`
- `useNodeGraphEvents`
- `useNodeDragState`
- `useNodeGallery`
- `usePrimitiveCameraState`

Target shape:

```tsx
function NodeCanvas(props) {
  const graph = useResolvedGraph(props.doc);
  const selection = useNodeSelectionSync(...);
  const camera = usePrimitiveCameraState(...);
  const menus = useNodeContextMenus(...);
  const graphEvents = useNodeGraphEvents(...);
  const gallery = useNodeGallery(...);

  return (
    <Providers>
      <ReactFlow ... />
      <Panels ... />
      <Menus ... />
      <Gallery ... />
    </Providers>
  );
}
```

## QA checklist for node editor changes

Before merging node editor changes:

- Select/move/delete each node type.
- Add each layer kind through the add menu.
- Connect/disconnect graph edges.
- Right-click graph and node shells.
- Text/image drag, rotate, wheel-scale.
- Primitive left-drag, right-drag, wheel, lock, reset.
- Open gallery for text/image/primitive.
- Export a graph with primitive camera override.
- Verify graph pan/zoom still works outside node-local controls.

## Do not do this

- Do not make node-local gestures write to the document every frame.
- Do not add side-panel camera sliders for primitive orientation.
- Do not reintroduce primitive placement controls; primitive framing belongs to the node viewport/camera path.
- Do not let right-click viewport pan also open the node context menu.
- Do not use scene-level floating controls for node-local state.
- Do not create new node data that cannot render through `CanvasDocument` and `CanvasGraph`.
