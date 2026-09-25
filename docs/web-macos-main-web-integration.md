# Main Web shared document session (P05)

Issue [#265](https://github.com/shchilkin/artifact/issues/265) moves the real
`/app` editor's durable document and Undo/Redo timeline into one persistent
Rust/WASM `WebSession`. The isolated pilot remains a conformance harness. The
React hook `useEditorDocument` still owns the browser-facing document selector,
selection, localStorage save status and IndexedDB project/asset integration.
Canvas/Pixi/Three preview and export paths still read `CanvasDocument`.

## Editing boundary

`SharedDocumentSession` opens from the normalized, lightweight Web document.
It converts each immutable TypeScript candidate into versioned commands and
checks the WASM draft against that candidate before publishing it to React.
Supported layer fields, global/export fields, simple stack additions/removals,
and supported graph edits use typed shared commands. Complex Web structure,
shader/3D graph values and unmigrated layer properties use the named P03
`web:structure`, `web:graph` or `web:layer-property` bridge in the **same**
transaction. Root asset collections use `edit_assets`. An explicit New, Open,
starter or Random action uses one `replace_document` transaction, including
unknown metadata and portable asset fields. The old TypeScript history module
is no longer used by this hook.

Shared 2D node insertion/splitting, removal, duplication and area assignment
use typed graph commands when their final structure matches the Web operation;
Web-only node/edge semantics remain explicit graph bridges. A data-URL image
fallback larger than the ordinary 1 MiB update envelope uses one bounded cold
`add_layer` or `patch_layer {src}` command inside its existing user transaction.
The ordinary command limit is unchanged.

Discrete actions commit one Undo entry. A continuous inspector gesture keeps a
single transaction open for 400 ms after the last update. Undo/Redo first
commit any pending gesture, then navigate Rust history. The toolbar counts come
from Rust's bounded history summary, so byte-budget eviction cannot drift from
the UI. A rejected command leaves the last accepted document visible and
reports an editor error. An asynchronous commit error restores the durable
document and reports the failure. Unchanged object references are retained by
publishing the validated TypeScript candidate itself.

The first switch into Nodes materializes a graph as one explicit, undoable
transaction. For a document edited in Layers, Undo on Nodes returns to the
stack document, a second Undo reverses the prior layer edit, and Redo restores
both in order. The bootstrap effect only runs on the view-mode transition, so
Undo does not immediately recreate the graph.
Opening a graphless file while Nodes is active includes the graph bootstrap in
the one replacement transaction. Undo returns directly to the document before
Open, even if it had no graph.

## Loading and assets

The editing surface is inert while WASM initializes or an imported document is
prepared. A WASM load failure keeps the existing document intact and offers a
retry; the editor never falls back to a second history implementation.
Portable image/font/model/environment payloads are stored before opening the
session or applying an explicit document replacement. Successful storage strips
the portable bytes from the active document; failed IndexedDB writes retain
them in the canonical document so an edit or export cannot silently lose them.
Unknown serializable graph, shader and asset metadata survives normalization,
storage and hydration. Metadata-only asset entries stay in the document when
they have no bytes to store. A failed Open does not change the active project
binding; successful project loads bind only after the shared session accepts
the replacement.
File drops
and generated image results resolve their IndexedDB image reference before
assigning it to a layer. A document epoch and per-image write serial prevent a
late storage result from overwriting a newer image choice or a New/Open action.
When IndexedDB is unavailable, the existing data-URL fallback remains
renderable for PNG and JPEG within the shared image limits. Inline AVIF, GIF,
SVG and WebP sources are still outside the shared source validator
if IndexedDB cannot store them; ordinary asset references remain supported.
Local projects remain in IndexedDB; active lightweight document state remains
in localStorage.

The Web renderer, thumbnail cache, export options and graph UI state remain
outside the Rust package. No DOM, canvas, GPU object or decoded image enters
serializable document state.

## Verification boundary

`sharedDocumentSession.test.ts` runs real WASM bytes against mixed shared/Web
edits, graph actions, bridge history, first Nodes bootstrap and embedded-font
document replacement. `imageSourceWriteGate.test.ts` uses delayed storage
promises to prove stale writes are ignored. `packages/artifact-core-web` tests
cover the shared command envelope. These are model and adapter checks; browser
UI journeys, exported files and performance measurements are recorded
separately. The canonical generated runtime and source manifest must be
regenerated together with `npm run build:core-wasm-canonical`.
