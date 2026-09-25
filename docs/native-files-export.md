# Native project files, assets and raster export (P07)

P07 implements issue [#267](https://github.com/shchilkin/artifact/issues/267) on
the coordinator-approved P06/P03 stacked base. It adds native file and asset
adapters while the shared Rust session remains the document and history owner.
The native UI is still subject to the real Web → Mac → Web and picker acceptance
run by the coordinator. The tests below are model and headless raster evidence.

## Project and asset rules

`ProjectFileService` validates a 64 MiB input before opening it in
`NativeSession`. It accepts version 1 `.artifact` packages containing schema 3
documents. It also wraps a bare schema 3 `.artifact.json` document in the
current package envelope. A graph-free schema 1 or 2 document receives the
known global/export defaults and schema 3 wrapper without changing layer
values. Older graph documents need the Web editor's shader migrations; native
open explains that step instead of approximating a migration or dropping
nodes. Newer schemas and invalid packages are rejected. Current packages pass
through the shared session, which retains unknown fields, graph members and
package metadata at the JSON value level. Native can save richer Web projects
even when their preview/export is unsupported. It blocks raster export of
unsupported graph/layer content rather than flattening it.

Native image import and replacement validate PNG/JPEG bytes, at most 8 MiB and
4096 × 4096 source pixels. The adapter bakes EXIF orientation into an embedded
PNG and rejects an encoded result over 16 MiB. Finder file drops and the
clipboard use the same image adapter; clipboard/drop image data also accepts
TIFF and converts it to portable PNG. A missing `artifact-asset://` image or
invalid embedded image produces a visible notice and cannot silently export.
Font import validates a TTF/OTF up to 8 MiB, asks the user to confirm they may
embed it, and records a portable `fontAssets` entry with source name, family,
MIME, byte count and `user-confirmed-required` embedding policy. One shared
transaction attaches bytes and changes the text font URI, so Undo removes both.
Metadata-only or missing imported fonts remain editable project data; export
requires the actual bytes or a replacement font.

The active file, recents and recovery files are handled by the model and file
service. Save adopts its destination. Save Copy writes the current committed
content to another file while retaining the active file, inspector drafts,
history and dirty state. It never applies valid or invalid inspector drafts.
Atomic writes leave an old destination intact on failure. The close/quit guard
includes unapplied inspector drafts; Save applies valid drafts and blocks an
invalid draft, Cancel keeps the session, and Discard removes recovery. Recovery
stores the committed project plus inspector drafts in a hash-linked sidecar.
An interrupted or mismatched sidecar restores only the committed project.
At startup, New and Open ask whether to Restore, Discard and continue, or
Cancel when recovery exists. Recovery remains on disk until New or Open
succeeds, so canceling the picker or failing to open a file leaves it available.

## Raster export

`NativeExportService` receives a fresh bitmap rendered from the captured
committed revision at the Web base size: 1000 × 1000, 1080 × 1350, 1080 ×
1920, or 1920 × 1080. It scales that completed image by 1, 2 or 3 with nearest
neighbor interpolation. Effects are evaluated once at the base size, matching
the Web `effectResolution` path. PNG retains alpha. JPEG uses quality 0.92 and
an opaque black background, matching the recorded P01 Web alpha/JPEG fixture.
The full raster never comes from a 500- or 1000-pixel draft preview. A newer
document revision cancels the task; the model checks the captured revision
again immediately before the atomic destination write. File-panel callbacks
also reject a project or inspector draft changed while the panel was open.

The former native pilot scaled chromatic aberration against 3000 pixels.
`render_plan_json` now rounds `ca × render width / 540`, matching the Web
Canvas effect scale. The change affects only the transient plan; saved `ca`
and history do not change. A focused Rust test covers base export and draft
widths at all four aspects. Renderer antialiasing, glyph placement and effect
pixels still require real-client comparison; dimension and alpha tests do not
establish pixel parity.

## Automated checks and GUI handoff

`npm run build:core-pilot -- macos` builds the native target.
`npm run check:core-native` runs `model-check`,
`image-check`, `file-export-check`, the P01 render comparison and the native
2D renderer fixture checks. `file-export-check` decodes all 24 aspect × format
× scale outputs, checks dimensions and alpha, tests a redistributable embedded
font, a richer unknown-field roundtrip, invalid input, write failure and
hash-linked draft recovery. `model-check` exercises Save Copy, reopen, failed
writes, inspector drafts and late export cancellation. Synthetic samples are
written under ignored `test-results/core-pilot/public-native/files-export/`;
the source font and alpha image are from `tests/fixtures/native-2d`.

Before the review fixes, the coordinator exercised the actual app's Restore →
Save path and checked exact package JSON, kept the draft after New → Cancel,
kept the active file and dirty state after Save Copy, imported an OFL font
through confirmation with Undo/Redo, imported an image through the picker,
opened a Web font package, and wrote a 2× PNG and 3× JPEG. The Mac Save Copy
at `/private/tmp/artifact-wave3-evidence/web-mac-assets-roundtrip.artifact`
contains the imported font and image and the edited title. These observations
were made before the recovery, Save Copy draft and panel-generation review
fixes; those fixes still need a fresh GUI smoke. Finder drag, clipboard and
Web reopen of the Mac-saved file were not observed in that pass. The native
model harness does not prove those UI paths. Save and export remain local;
this package does not add cloud storage or distribution.
