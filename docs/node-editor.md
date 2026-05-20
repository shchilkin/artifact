# Node Editor

This document describes the node editor architecture and interaction grammar.

## Purpose

The node editor is a visual composition surface over the same `CanvasDocument` used by the layer editor. It should feel direct: select a node, adjust the thing inside it, and connect it to other nodes without fighting graph pan/zoom.

The node editor should not become a second document model.

## Main files

| Area | Files |
| --- | --- |
| Shell | `app/components/node-canvas/NodeCanvas.tsx` |
| State machine | `app/components/node-canvas/machine.ts` |
| Context | `app/components/node-canvas/context.ts` |
| Node construction | `app/components/node-canvas/buildRFNodes.ts` |
| Node components | `app/components/node-canvas/nodes/NodeTypes.tsx`, `NodeShell.tsx` |
| Node previews | `app/components/node-canvas/thumbnails/*` |
| Inspectors | `app/components/node-canvas/inspector/*`, `panel/NodePropertiesPanel.tsx` |
| Menus | `app/components/node-canvas/menus/*` |
| Graph helpers | `app/utils/nodeGraph.ts` |

## Architecture overview

`NodeCanvas` receives the canonical document and callbacks from `generator.tsx`.

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

The generator route treats node mode as a full-canvas workspace: navigation,
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
- Document mutations should happen through `useGeneratorDocument` callbacks.
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
| `exportNode` | Terminal output target. |

Layer nodes map to `CanvasDocument.layers`. Merge, color, and repeat nodes live
in `CanvasGraph`.

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
| Right-click graph | Open pane add menu |
| Right-click node shell | Open node context menu |
| `M` with layer nodes selected | Mute/unmute selected layer nodes by toggling visibility |

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
- Node cards may size by content type; avoid assumptions that every node is the
  same fixed width.
- Thumbnail rendering should keep the last good frame during graph drag
  gestures. Dragging a node should move the node shell, not restart expensive
  render work inside every preview.
- Only selected node previews should be urgent during edits. Output/export
  thumbnails can render at higher quality when selected, but otherwise they
  should stay passive so a control change does not redraw the whole graph on the
  critical interaction path.

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
