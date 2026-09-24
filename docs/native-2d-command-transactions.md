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
`changes`, and `error`. `changes` names only touched layer IDs and fields,
global/export fields, and graph/order flags. A rejected update returns a
stable error code and leaves the previous draft intact. The current codes are
`INVALID_ENVELOPE`, `UNSUPPORTED_VERSION`, `REVISION_CONFLICT`,
`ACTIVE_TRANSACTION`, `STALE_TRANSACTION`, `INVALID_TARGET`, `INVALID_VALUE`,
`LOCKED_LAYER`, `UNSUPPORTED_CAPABILITY`, `PACKAGE_LIMIT`, and
`COMMAND_REJECTED`. Native and WASM return the same serialized result; host
binding failures remain host errors.

`revision` advances on a durable commit or successful Undo/Redo. Accepted
updates advance `draftRevision` only. No-op updates do not advance either.
Commit of a net-zero gesture and cancel restore the initial document and leave
Redo intact. A real commit creates one Undo entry and clears Redo. Legacy
setters/`execute` and new commands share this history; legacy mutation and
Undo/Redo are blocked while a transaction is active. `export_json` exposes the
current draft for preview. `export_durable_json` rejects while a draft is
active, so save/export callers cannot mistake a transient frame for a
committed document. The session does not serialize image/font bytes or clone
the entire document on property ticks; structural commands still use the
existing bounded document clone path. History stores touched values and at
most 50 entries, with the existing 64 MiB retention bound.

## Command coverage and boundaries

Typed commands are `patch_layer`, `patch_layers`, `patch_global`,
`patch_export`, `add_layer`, `duplicate_layer`, `remove_layer`, and
`move_layer`. Layer patches cover shared 2D properties and visibility/lock;
multi-layer patches reject atomically. Global patches cover the four Web
aspects, transparent or hex background, and seed. Export patches cover PNG,
JPEG, scales 1–3, and 2D `cover`. Existing `envmap` values are preserved; the
explicit `web:export-envmap` bridge can set that Web-only target. The bridge
also accepts `web:layer-property` for a named non-shared layer field and
`web:graph` for a complete graph value after ID/edge-endpoint checks. It cannot
change schema, layer IDs/kinds, shared validated properties, or arbitrary
package paths. A bridge step journals into the same history. A future Web
operation should enter through the bridge until its typed shared command is
registered; it must not keep a second Undo owner beside this session.

`move_layer` changes `document.layers` order only, including on nonlinear
graphs. It rejects a move that changes the index of either locked layer and
does not rewrite graph edges. The current main Web reorder flow also
synchronizes some stack/graph topology; #264 and #265 must compose that rule
explicitly before claiming full Web workflow parity. Removal rejects locked
layers (including their layer-backed nodes). Inspector property edits remain
permitted on locked layers. Unsupported graph utilities still block the legacy
structural add/delete path with a capability error; P04 owns graph algorithms.

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
