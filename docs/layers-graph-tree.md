# Layers Graph Tree

Design contract for showing custom node graphs in the Layers panel. Delivery is
planned in [`version-plans/v0.50.md`](./version-plans/v0.50.md).

## Problem

For a layer stack graph (`isLayerStackGraph` in
`apps/web/app/utils/documentCommands.ts`) the Layers list and the graph agree:
one chain of layers ends in Output. For any custom graph, `renderGraphTarget`
walks upstream from `__export__` and ignores `doc.layers` order, so a flat list
tells the wrong story. Utility nodes outside areas are hidden, and stack reorder
is disabled.

The goal is to derive the Layers view from the graph instead of from
`doc.layers` whenever the graph is custom. Linear graphs keep today's list.

## Prior art

The tools we compared agree on one pattern: nested compositing is a folder with
blend settings, a mask is a clip-style child, side inputs are indented children
of their consumer, shared sources are reference rows, and unused data has its own
section. Tools built around a pure DAG (Nuke, Fusion) do not pretend the graph is
a stack.

- Photoshop groups and clipping masks:
  [layer groups](https://helpx.adobe.com/photoshop/using/create-layers-groups.html),
  [clipping masks](https://helpx.adobe.com/photoshop/using/revealing-layers-clipping-masks.html)
- After Effects precomps and shared track mattes:
  [precomposing](https://helpx.adobe.com/after-effects/desktop/work-with-compositions/precomposing-and-nesting/precomposing-nesting-pre-rendering.html),
  [track mattes](https://helpx.adobe.com/after-effects/desktop/work-with-transparency-and-compositing/work-with-track-mattes-and-traveling-mattes/track-mattes-and-traveling-mattes.html)
- Figma masks and boolean groups:
  [masks](https://help.figma.com/hc/en-us/articles/360040450253-Masks),
  [boolean operations](https://help.figma.com/hc/en-us/articles/360039957534-Boolean-operations)
- Blender Outliner display modes, including orphan data:
  [Outliner](https://docs.blender.org/manual/en/latest/editors/outliner/interface.html)
- Substance 3D Painter anchor points as named shared references:
  [anchor point](https://experienceleague.adobe.com/en/docs/substance-3d-painter/using/effects/anchor-point)
- Cavalry scene tree with nested generators:
  [scene tree](https://cavalry.studio/docs/user-interface/menus/window-menu/scene-window/scene-tree/)

## Tree derivation

Reachability has one home: the walk in
`apps/web/app/utils/render/graphInputs.ts`. Layers rows use it (through
`collectGraphRenderReach` and `collectDocumentOutputNodeIds`) for their "not in
output" status, and the tree builder takes its in-output set and the inputs it
nests from the same walk (`collectGraphRenderReachModes`).

A pure `buildGraphLayerTree(doc)` starts at `__export__.in` and follows each
node's primary input upstream. Rows are listed top-first: the node nearest
Output is at the top of its stack.

| Graph shape | Tree row |
| --- | --- |
| Layer with a `bg` input | Stack row; its `bg` source continues the same stack below it. |
| Layer without a `bg` input | Bottom row of its stack, composited over transparency. |
| Effect, color, transform, grime-shadow (`in`) | Adjustment-style row that continues the stack through `in`. |
| Mask (`in` + `mask`) | Row that continues through `in`; the `mask` source is a nested clip-style child stack. |
| Merge (`a`, `b`) | **Decided:** a group folder showing blend and opacity. Its children are the `b` stack; `a` continues the parent stack below the folder, like an isolated Photoshop group. |
| Repeat (`in` item, `bg` backdrop) | **Decided:** row that continues through `bg`; the `in` item is nested as a "Pattern source" child. This is the one node where `in` is not the primary port. |
| Scene 3D (`bg`, `model`, `material`, `env`) | Row that continues through `bg`, with an "Inputs" child holding Model, Material, and Environment stacks. |
| Material, texture-map, and environment side inputs | Nested "Inputs" under the consuming node. |
| Shader (`bg`) | Row that continues through `bg`. |
| Node feeding more than one consumer | **Decided:** the full subtree appears once, where a depth-first walk first reaches it (primary port, then `b`, `mask`, side ports). Every other use is a childless reference row ("↪ Name") that selects the full entry. |
| Nodes or layers not reachable from Output | "Not in output" section at the bottom, each shown as its own stack by the same rules. |

The walk keeps a visited set so malformed or cyclic data cannot loop, tolerates
missing edges, and resolves duplicate inputs on one port with the same lookup
order as the renderer. A fixture test must prove that the set of nodes in the
tree equals the set of nodes the renderer reaches, plus the "Not in output"
section.

## Editing in the tree

A **run** is the longest chain of nodes joined through primary ports where each
node has exactly one consumer. Every edit below is one undoable document update
(one `snapshot` history entry).

| Operation | Graph edit | Where |
| --- | --- | --- |
| Visibility, lock, rename, inspector edits | None to topology | Layers |
| Reorder within a run | Rewire the run's primary edges; the input port follows the `inferLinearGraph` rule (`in` for effects and single-input utilities, otherwise `bg`); the run's outer ends stay attached | Layers |
| Add above the selected row | Insert between the row and its consumer on the consumer's original port | Layers |
| Move a row between runs, including into or out of a merge `b` stack | Splice out of run A, splice into run B; blocked for shared nodes and rows with side inputs | Layers |
| Delete | Remove and reconnect upstream to downstream; drop the edge for side-input sources; warn when the node is shared | Layers |
| Group selection into a merge | Replace a contiguous run segment with a new merge (`b` = segment, `a` = what was below) | Later release |
| Wiring side inputs, creating shared nodes, swapping `a`/`b`, repeat item versus backdrop, edits across reference rows | Arbitrary edge edits | Nodes, reached through an "Edit in Nodes" row action |

Dropping onto a reference row is not allowed.

### Implementation (v0.50 U7)

The commands are pure functions in `apps/web/app/utils/graphTreeEdits.ts`. They
read the same tree as the view (`buildGraphLayerTree`), so a row can only be
moved to a gap the person can see.

- **Runs.** Within one tree stack, a row is in a run unless it is a reference
  row, it feeds more than one edge (shared), or it is the top row of a side-input
  stack (Scene 3D model, material, environment, or a texture map). Those rows
  end a run; a shared node below a run is the run's lower outer end and stays
  attached to whatever ends up at the bottom.
- **Primary port.** Each node's primary port comes from the renderer's own input
  table (`graphNodePrimaryPort` in `render/graphInputs.ts`): `in` for effects and
  single-input utilities, `bg` for other layers, repeat, Scene 3D, and shaders,
  `a` for merges, and `albedo` for a standalone material. For layers this is the
  `inferLinearGraph` rule. A node without one (a fill-role shader) can only sit
  at the bottom of a stack.
- **Gaps.** A row can move to the gap above or below any full entry. "Above" is
  the edge into the row's consumer on its original port; "below" is the edge into
  the row's primary port. These gaps are not editable:
  - the top gap of a side-input stack;
  - the gap below a row that does not continue a stack (a Scene 3D model the
    renderer only reads);
  - the gap above the top of a stack outside Output when that row still feeds an
    input the renderer ignores (a losing duplicate edge, or a port the consumer
    does not read). A row placed there would make it feed two inputs, which is
    creating a shared node, so the edit is blocked with a reason that points to
    Nodes.

  A gap next to the row itself is a no-op.
- **Within a run versus between runs.** A move whose gap lies inside the row's
  own run (including its outer ends) is a reorder, allowed for any movable row,
  including merges and Scene 3D nodes with their inputs. Any other gap is a move
  between runs.
  - A row moves with its structural children: a merge with its `b` group, a mask
    with its clip, a repeat with its pattern source. Only the row's primary edges
    are spliced, so those stacks stay attached.
  - A row with side inputs (Scene 3D model, material, or environment, or a
    primitive material) only moves within its run. Those inputs are wiring that
    belongs in Nodes.
  - A row can't move into its own inputs: a move is blocked when the gap's
    consumer is upstream of the row once the row has left its place (for example
    a merge dropped into its own group), because that would make a cycle.
- **Splicing.** Splice-out replaces the row's consumer edge with one from the
  row's primary source, in the same position in `graph.edges`. Splice-in replaces
  the gap's edge with one from the moved row and inserts the edge into the row
  just before it. The renderer reads the first edge on a port, so every edge the
  edit wires is moved ahead of any other edge on its port, and bridges take the
  removed edge's place. Every edge outside the splice keeps its endpoints and its
  order on its port.
- **Delete.** Each image input the node fed (a primary, merge `b`, mask, or
  pattern port, or Output) now reads the node's primary source on the same port,
  in the removed edge's place.
  - Side inputs it fed are dropped instead of rewired, because wiring side inputs
    happens in Nodes. Side inputs are the Scene 3D model, material, and
    environment, a primitive material, and texture ports. A port counts by how
    the renderer uses its consumer: a material read through a `material` port
    treats `albedo` as a texture map, so it is a side input there, while a
    standalone material's `albedo` is its stack.
  - Edges from the node's own non-primary sources are dropped, so those sources
    move to "Not in output".
  - **Deleting a shared node shares its source.** Each place that used the node
    now uses what was under it, so that source feeds all of them. The edit
    creates a shared node, which is otherwise a Nodes edit, so it always asks
    first through `EditorConfirmDialog`, and the dialog says the source becomes
    shared. A shared node with nothing under it just leaves those inputs empty.
  - Locked layers are not deleted.
- **Add above.** With a tree row selected, Add Library places a new layer or
  Scene 3D node in the gap above that row and positions it between the row and
  its consumer in Nodes. With no selection, a side-input top selected, or a
  linear graph, Add works as before.
- **Blocked edits** leave the document unchanged and say why. Reasons name the
  row and point to Nodes when the edit belongs there.
- **Feedback.** Every outcome shows in the shared `InlineNotice` (through
  `EditorWorkflowNotice`), as a status live region: `info` for a done edit,
  `warning` for a blocked one. It is laid over the bottom of the panel so a message
  never shifts the rows, it stays mounted while empty so screen readers register
  the region first, and it clears after a few seconds.
- **Shared code.** Order-preserving edge edits (`createGraphEdge`,
  `splitGraphEdgeInPlace`, `rewireGraphEdgeSource`, `promoteGraphEdges`) and
  `documentGraph` live in `utils/nodeGraph.ts`. New edges use the `e-from-to` id,
  and a split edge uses `splitEdgeWithNode`'s `__before` and `__after` ids.

### Interaction

- Drag a row onto the upper or lower half of another row. The drop line is an
  inset shadow on the target row (`data-tree-drop`), so rows never shift while
  dragging. The lower half of an open merge folder is the top of its group. The
  dragged row dims (`data-tree-dragging`), and a row being placed with Move to…
  is outlined (`data-tree-moving-row`). `/docs/style-guide` section 04 shows each
  state.
- Rows that cannot move are not draggable: reference rows, shared nodes,
  side-input tops, and locked layers.
- Keyboard, on a focused row: <kbd>Alt</kbd>+<kbd>Up</kbd> or
  <kbd>Alt</kbd>+<kbd>Down</kbd> moves it within its stack; <kbd>Delete</kbd> or
  <kbd>Backspace</kbd> deletes it (or the selection it belongs to);
  <kbd>Shift</kbd>+<kbd>F10</kbd> opens row actions.
- Row actions add Move up, Move down, Move to…, Edit in Nodes, and Delete for
  graph-only nodes. Graph-only and shared-use rows get the same "•••" actions
  button as layer rows, so touch screens reach them too. A blocked action stays
  focusable and announces its reason.
  Move to… starts a keyboard move: arrow to a row, then <kbd>Enter</kbd> places
  the moving row above it and <kbd>Shift</kbd>+<kbd>Enter</kbd> below it;
  <kbd>Escape</kbd> cancels.
- After a move the row keeps focus in its new place, and folders around it open.
- Edit in Nodes switches to Nodes with the node selected. Reference rows offer it
  too.

### `doc.layers` consistency

In graph mode `doc.layers` order has no render effect, but it is still the stack
that stack-mode rendering draws, that packages store, and that
`isLayerStackGraph` compares the graph against. The rule for tree edits
(`placeLayerForTreeEdit`):

- A layer that moves, or is added above a row, is placed in `doc.layers` directly
  above the nearest layer below it in its new stack (following primary inputs
  through graph-only nodes). If there is none, it goes directly below the nearest
  layer above it (following single consumers). If there is neither, it goes on top.
- Every other layer keeps its order. Deleting a layer removes its entry. Moving or
  deleting a graph-only node leaves `doc.layers` alone.

So a chain of layers keeps its bottom-to-top order in `doc.layers`, and a graph
that tree edits turn back into a plain layer chain is recognized as the layer
stack again (Layers switches back to the flat list, and stack-mode rendering
draws the same order as the graph). Packages need no change: they serialize
`doc.layers` and `graph` as they are, and a tree edit round-trips through a
project package unchanged. `graphTreeEdits.test.ts` covers both.

## Areas

Areas are organization labels; merge folders are topology. An area can span
several branches, so both cannot be folders at once.

- In the graph-derived tree, only structural folders (merges, input stacks) are
  folders. Area membership is a colored rail on each member row plus an area
  chip.
- The panel header offers **Structure** (default for custom graphs) and
  **Areas** (today's area folders over a flat list).
- Linear graphs keep today's area folders, because there is only one stack.

## Open risks

- `doc.layers` order has no render effect in graph mode. Tree edits keep it
  consistent by the rule in "`doc.layers` consistency" above; edits made in
  Nodes do not reorder `doc.layers`.
- Deep nesting on narrow screens needs an indentation cap and collapse defaults.
- Folder-row thumbnails (`renderGraphTarget(mergeId)`) must respect thumbnail
  invalidation rules in [`rendering.md`](./rendering.md).
- Structural folder collapse state is UI state keyed by node id.
- Selecting a reference row selects the canonical node in both modes.

## Implementation notes (v0.50 U6)

- `apps/web/app/utils/render/graphInputs.ts` describes the inputs the renderer
  follows per node kind and use (`render`, `material`, `read`); the renderer
  imports only its port lookup from there, and the shared renderer-backed
  fixtures in `test-fixtures/render/graphReachFixtures.ts` guard the rest
  against drift. `buildGraphLayerTree`
  (`apps/web/app/utils/graphLayerTree.ts`) walks those inputs, so ignored
  inputs land in "Not in output" exactly as the renderer ignores them: a
  losing duplicate edge, a fill-role shader's `bg`, a standalone material's
  non-albedo maps, a node that is not a 3D source on `model`, and a node that
  is not a material or shader on `material`. In that last case the renderer
  still renders whatever feeds the node's texture ports, so those sources
  appear as the consumer's own inputs (for example Inputs → Roughness).
- Merge `b` rows sit directly under the merge row; mask, pattern, and "Inputs"
  folders are labelled rows. Visual indentation is capped (6 levels on wide
  screens, 3 on narrow ones) while `aria-level` stays exact. Narrow screens
  start with nested folders and "Not in output" collapsed.
- The tree is one multi-selectable ARIA tree with roving focus: arrows move
  and expand or collapse, Home/End jump, typing a character jumps to the next
  row whose name starts with it, Enter/Space select, F2 renames a layer, and
  Shift+F10 or the context-menu key opens layer actions. Carets are pointer
  shortcuts and never take focus.
- Custom graphs switch views with a Structure/Areas segmented control (toggle
  buttons, not tabs: both views fill the same list).
- Selecting a graph-only node shows a short inspector notice; its settings are
  edited in Nodes until a later release brings those inspectors to Layers.
- Folder rows have no thumbnails, matching layer rows. If they are added, they
  must render through the content-keyed graph cache described in
  [`rendering.md`](./rendering.md) and invalidate only on commit.

