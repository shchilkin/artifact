# Shared document commands and transactions (P03)

Issue [#263](https://github.com/shchilkin/artifact/issues/263) adds a version 1
command envelope to `DocumentSession`. This work began from the coordinator
approved stacked P01/foundation base
`78d47bd27d70c1e30ab9cef45fc195bd578698e5` and is now stacked on the
reviewed P02 tooling commit `856c7e38d790c49f2bfe205e359b6f6b67b9a240`.
It is a core and binding
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

## Root assets and cold document replacement

`edit_assets` is a shared typed command for exactly one root collection:
`fontAssets`, `modelAssets`, or `envAssets`. It accepts `upsert` asset objects,
`removeIds`, or an exclusive `replace` array. Every entry needs a unique,
nonempty string `id` (at most 200 characters). Upsert merges the supplied
object into an existing object with the same ID, preserving unknown fields;
untouched objects remain unchanged. Removing an absent ID is a no-op, including
when the root collection is absent. Explicit `replace: []` creates an empty
collection, distinct from an absent field. A collection that was already empty
remains empty on a no-op. The command does not inspect payload bytes or make
font-license decisions; native and Web file import validate those before the
command. Serialized asset metadata and portable data URLs are document data;
decoded objects and host asset-store content remain outside the session.

For a native font import, begin one transaction, update with
`{"commands":[{"type":"edit_assets","collection":"fontAssets","upsert":[{"id":"font-1","dataUrl":"data:font/ttf;base64,...", "mime":"font/ttf", "bytes":123, "label":"My Font", "family":"My Font", "createdAt":"..."}]}]}`,
then update the same transaction with
`{"commands":[{"type":"patch_layer","id":"title","patch":{"font":"artifact-font://font-1"}}]}`
and commit once. Both updates can share one envelope when it is below 1 MiB.
Larger single `edit_assets` updates may use the cold 64 MiB envelope allowance.
Commit, cancel, Undo, and Redo cover both changes together. A bounded font URI
may point to a host-managed IndexedDB asset even when `fontAssets` is absent;
the host must resolve it before rendering or export. Core accepts the current
bundled font IDs from `apps/web/app/types/typography.ts` and syntactically valid
`artifact-font://` IDs. Native must separately report missing font resources.

`replace_document` accepts a complete schema-3 document object in one cold
command, for New, import, or explicit replacement only. It validates the same
package/schema/layer invariants as opening a package and validates graph IDs
and edge endpoints. The package manifest and package-level metadata stay
untouched. Unknown document JSON values, and absent versus explicit null root
fields, survive at the JSON value level. Replacement is one Undo step and has
no lock restriction because the user is replacing the document. Normal edits
must use narrower commands. A replacement must be the only command in its
update. A single cold replacement can use a 64 MiB command envelope. The
package remains limited to 64 MiB; root asset/replacement inverse history is
bounded to 128 MiB within a transaction, while ordinary edits keep the 64 MiB
transaction budget. A rejected update leaves the prior draft intact.

Results add `changes.assets` (names of changed collections) and
`changes.document` (other root document fields, such as schema or future
metadata). Existing layer/global/export/graph/order details remain in the
same result. No new FFI method is needed: send these commands through the
existing `update_transaction_json` method on WebSession or NativeSession.

## Verification and evidence limits

Run `cargo test -p artifact-core` and `npm run check:core-native` after
`npm run build:core-wasm-canonical` and `npm run build:core-pilot -- macos`.
The native check runs `node tests/core-commands/verify.mjs` in CI. The dedicated
harness compares serialized command replies and JSON document states across
Rust, WASM, and Swift for all eight synthetic P01 fixture documents, a 2 MiB
unknown field with an `artifact-asset://` image reference, and a cold structural
edit retaining a 2 MiB embedded image. It checks draft, commit, Undo, Redo,
reopen, and stale-ID results. Existing `npm run test:core-pilot` remains a
separate backward-compatibility gate. These are model/binding checks. They do
not establish main Web adoption, Mac GUI gesture behavior, native rendering,
or the P01 timing/memory targets.
