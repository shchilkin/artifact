# Web + macOS editor workspace

Owner authorization: build a cohesive native editor after the document/render
pilot, without asking for manual acceptance of each small field. Web and macOS
share supported property commands, history, and portable packages through the
Rust session. The main Web adoption is documented in
[main Web integration](./web-macos-main-web-integration.md). Its existing
rendering and advanced graph behavior remain available.

Acceptance for this workspace:

- Three-pane macOS workspace: layers, artwork or nodes, shared inspector.
- Add text/image/fill/emoji/effect, rename, visibility/lock, duplicate/delete,
  and graph-aware ordering; undo restores exact prior state.
- Text/image placement, scale and rotation via canvas gestures, one commit
  per gesture; numeric controls remain available.
- Inspect supported fill, emoji and seven effect parameters.
- Basic layer-backed node canvas: pan/zoom, move nodes, connect/disconnect,
  explicit output, cycle/port validation. Shared layer/node selection.
- New/open/save/save copy/recent files, dirty close guards and recovery draft.
- Valid inspector typing updates the preview through a shared transaction and
  commits as one Undo step on focus change, selection change, or Save/Export.
  Invalid values remain editable drafts and block Save/Export. Cancel restores
  the durable value. Save Copy retains the committed document while a draft is open.
- Web uses WASM; macOS uses native bindings to the same commands. Unchanged-field preservation and
  Web -> Mac -> Web conformance checked automatically.
- Real native GUI pass as a complete workflow, supported by model/render tests.

Existing advanced graphs are preserved and structural edits rejected when they
contain unsupported graph-only nodes. Layer reordering is enabled only for a
single chain containing every layer; branching/disconnected graphs retain their
explicit edges and are edited in Nodes. No automatic graph flattening. Basic
node connections have one input per layer and may share upstream branches;
merge/mask/repeat/3D/shaders, cloud and other OS clients are outside this slice.

The native UI extends macOS conventions: system controls, compact layer rows,
large central artwork, stable right inspector. Graph category colors identify
node kinds. No production design-system replacement or release is implied.

## Earlier pilot evidence and current scope

Built app: `apps/macos/.build/Artifact.app`, bundle ID
`dev.shchilkin.artifact.workspace`; the previous pilot bundle is separate.
`npm run build:core-pilot` builds both adapters and the app.

The native model and three-adapter conformance checks pass. In the GUI, new
project, text edits, canvas drag with one-step Undo, duplicate, node selection,
and cycle rejection were exercised. A Web-created `Untitled-copy.artifact` was
opened in the Mac GUI, changed to `WEB + MAC`, saved and reopened from Recents.
Native file-panel automation is still intermittent for other selections; no
claim of a fully automated Viber GUI roundtrip for this workspace is made.
Real Viber native rendering and package compatibility are covered separately by
the adapter/model checks. Save Copy, image-picker and PNG-picker GUI coverage is
not equivalent to their importer/model tests.

Recovery stores the committed document and hash-linked inspector draft sidecar
under Application Support/Artifact Workspace. Selection is shared between the
open Layers, Nodes and inspector surfaces, but is not restored after reopening.
Pointer drafts render at a 500px maximum side; settled previews fit within
1000px, and export renders afresh at the Web base size for each supported aspect
before the requested scale. P08 replaces estimated text/image selection boxes
with the renderer's CoreText and decoded-image geometry. Explicit graph areas
can be created, assigned and collapsed through shared operations. Graph utility
rendering belongs to P09, and the complete Nodes UI belongs to P10. The current
P08 model/GUI acceptance evidence and remaining limits are in
[native layer interactions](./native-layer-interactions.md).
