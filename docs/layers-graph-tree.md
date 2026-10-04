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
node has exactly one consumer. Every edit below is one undoable document update.

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

- `doc.layers` order has no render effect in graph mode. Tree edits must keep
  `doc.layers` consistent enough for packages and stack-mode rendering; the
  exact rule belongs to the first editing issue.
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

