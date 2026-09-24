# Shared document commands and transactions (P03)

Issue [#263](https://github.com/shchilkin/artifact/issues/263) adds a version 1
command envelope to `DocumentSession`. This work began from the coordinator
approved stacked P01/foundation base
`78d47bd27d70c1e30ab9cef45fc195bd578698e5`. It is a core and binding
contract; the main `/app` editor still owns its TypeScript history until #265
adopts this session as its document owner. Native SwiftUI controls are also not
rewired by P03. The API is available to both adapters now.

## Calls and ownership

`NativeSession` (UniFFI) and `WebSession` (WASM) expose the same methods:
`revision`, `begin_transaction_json`, `update_transaction_json`,
`commit_transaction_json`, `cancel_transaction_json`, and
`export_durable_json`. The TypeScript wrapper is
`@artifact/core-web/transactions`. A session owns one parsed package, one
active transaction at most, and one history timeline. Clients own session
lifetime: free the WASM `WebSession` when its document closes; release the
Swift `NativeSession` reference when its document closes. Asset stores, decoded
images, fonts, view objects, and render caches remain client owned. Pass
`artifact-asset://...` references through commands. Register/import payloads
through a cold file or asset-store path before assigning the reference.

Begin with `{ "version": 1, "expectedRevision": 0 }`. The successful result
contains `transactionId`. Update with
`{ "version": 1, "transactionId": 1, "commands": [...] }`, then commit or
cancel with `{ "version": 1, "transactionId": 1 }`. Each result is JSON with
`version`, `ok`, `revision`, `draftRevision`, `transactionId`, `changed`,
`changes`, and `error`. `changes` names net-changed layer IDs and fields,
global/export fields, and graph/order flags. A rejected update returns a
stable error code and leaves the previous draft intact. The current codes are
`INVALID_ENVELOPE`, `UNSUPPORTED_VERSION`, `REVISION_CONFLICT`,
`ACTIVE_TRANSACTION`, `STALE_TRANSACTION`, `INVALID_TARGET`, `INVALID_VALUE`,
`LOCKED_LAYER`, `UNSUPPORTED_CAPABILITY`, `PACKAGE_LIMIT`, `HISTORY_LIMIT`, and
`COMMAND_REJECTED`. Native and WASM return the same serialized result; host
binding failures remain host errors.

`revision` advances on a durable commit or successful Undo/Redo. Accepted
updates advance `draftRevision` only. A batch whose commands return all fields
to their starting values reports `changed: false`, empty `changes`, and does
not advance either revision.
Commit of a net-zero gesture and cancel restore the initial document and leave
Redo intact. Cancel reports restored IDs and fields in `changes`; a no-op
cancel reports `changed: false`. A real commit creates one Undo entry and
clears Redo. Legacy
setters/`execute` and new commands share this history; legacy mutation and
Undo/Redo are blocked while a transaction is active. `export_json` exposes the
current draft for preview. `export_durable_json` rejects while a draft is
active, so save/export callers cannot mistake a transient frame for a
committed document. The session does not serialize image/font bytes or clone
the entire document on property ticks; structural commands use a cold candidate
path. Same-target property ticks across a property-only span, and adjacent
graph bridge ticks, coalesce into one inverse step. The transaction retains no
full-document baseline; commit and cancel reconstruct its initial state from
the inverse journal once. Active transaction history is bounded to 64 MiB and rejects an update
atomically with `HISTORY_LIMIT` if its inverse data exceeds the bound. P03
transaction groups therefore stay within that inverse budget. Durable history
stores at most 50 entries; legacy setters retain the newest Undo entry even
when it alone exceeds the 64 MiB eviction target.

## Command coverage and boundaries

Typed commands are `patch_layer`, `patch_layers`, `patch_global`,
`patch_export`, `add_layer`, `duplicate_layer`, `remove_layer`, and
`move_layer`. Layer patches cover shared 2D properties and visibility/lock;
multi-layer patches reject atomically. Global patches cover the four Web
aspects, transparent or hex background, and seed. Export patches cover PNG,
JPEG, scales 1–3, and 2D `cover`. Existing `envmap` values are preserved; the
explicit `web:export-envmap` bridge can set that Web-only target. The bridge
also accepts `web:layer-property` for a named non-shared layer field and
`web:graph` for a complete graph value after ID/edge-endpoint checks. The cold
`bridge_structure` command with `capability: "web:structure"` accepts a candidate
`layers` array and explicit `graph: { present, value }`; `present: false` means
the graph field is absent, while `present: true, value: null` retains explicit
null. It can add or delete current Web layer kinds (`text`, `image`, `emoji`,
`effect`, `fill`, `primitive`, `noise`, `array`, `lineField`, `model`) and reorder
surviving layers, while retaining unknown existing kinds and fields. Retained
graph utility nodes must keep their complete values; use `web:graph` for a
deliberate graph-node property edit. Unknown graph fields, including future
node-map objects, survive an unrelated structural edit. It rejects
changes to surviving layer properties, duplicate/invalid IDs, invalid graph
endpoints, locked deletion/reorder, and package growth beyond 64 MiB. The
ordinary 1 MiB command envelope limit rises to the package limit only for one
cold structure bridge, so legacy embedded image data does not block an
unrelated Web-only addition. This bridge cannot change schema, global/export
settings, shared validated properties, or arbitrary package paths. Each bridge
step journals into the same history. A future Web
operation should enter through the bridge until its typed shared command is
registered; it must not keep a second Undo owner beside this session.

`bridge_structure` expects a complete candidate document already accepted by
the existing Web schema and graph helpers, including layer-kind payloads,
ports, cycles, and Web-specific graph rules. The core checks structural shape,
known node collections, IDs, and endpoints at this boundary; full graph validation and graph
operations belong to #264. Web add/delete may shift a locked layer's absolute
index; the bridge guards its relative order among surviving existing layers.
`move_layer` changes `document.layers` order only, including on nonlinear
graphs. It rejects a move that changes the index of either locked layer and
does not rewrite graph edges. The current main Web reorder flow also
synchronizes some stack/graph topology; #264 and #265 must compose that rule
explicitly before claiming full Web workflow parity. Removal rejects locked
layers (including their layer-backed nodes). Inspector property edits remain
permitted on locked layers. Unsupported graph utilities still block the legacy
typed structural add/delete path with a capability error; #264 owns graph
algorithms.

`crates/artifact-core/src/properties.rs` is the per-kind validation seam for
new source/effect properties. Graph-rule modules can validate their candidate
and call `record_graph_change` to enter the same transaction journal. Neither
seam creates a second history owner. Unknown package/document/layer/graph
fields and absent versus explicit null values are preserved by commands,
Undo/Redo, save, and reopen at the JSON value level.

## Verification and evidence limits

Run `cargo test -p artifact-core` and, after `npm run build:core-pilot -- wasm`
and `npm run build:core-pilot -- macos`, run
`node tests/core-commands/verify.mjs`. The dedicated harness compares exact
serialized command replies and document states across Rust, WASM, and Swift
for all eight synthetic P01 fixture documents plus a 2 MiB unknown field and
an `artifact-asset://` image reference. It checks draft, commit, Undo, Redo,
reopen, and stale-ID results. Existing `npm run test:core-pilot` remains a
separate backward-compatibility gate. These are model/binding checks. They do
not establish main Web adoption, Mac GUI gesture behavior, native rendering,
or the P01 timing/memory targets.
