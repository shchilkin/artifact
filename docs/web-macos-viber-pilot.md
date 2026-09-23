# Web + native macOS: Viber pilot

Status: document-command core and both client shells implemented locally.
Rust/WASM/Swift command conformance passed. Native open/edit/undo/redo/save
passed through the GUI. Viber native rendering and PNG export now work;
The Viber Web -> Mac -> Web open/edit/save/PNG workflow is verified locally,
with minor noise/effect differences accepted. General editor coverage and
performance budgets remain open. Scope follows [ADR 0014](./adr/0014-web-and-native-macos-with-shared-rust-core.md).

## Source and evidence

The owner selected **Вайбер** on 2026-09-23 and supplied
`artifact-project-39u (10).artifact` and a Projects gallery screenshot.

- Source package SHA-256:
  `2334ccfa31273705918475869e9ebb759ad13078df8f4914f4940d9a5d7d6c08`.
- JSON project package version 1, document schema version 3.
- Captured from the existing Chrome tab at
  `https://artifact.shchilkin.dev/app` with Viber already loaded.
- Used Export artwork to download a fresh 3000 x 3000 PNG. Then downloaded
  the editable document and compared its parsed JSON with the supplied
  package's `document`: exact structural equality, including image payloads,
  graph, and font assets. No document edits were made.
- Export PNG SHA-256:
  `cd0a52c8ec1522e792259e0acb5a510bbcd4e4fe9762a2234ee9e011b7f7c6e8`.

Local evidence is under `tests/fixtures/core-parity/viber.local/`: the original
package, downloaded browser document, fresh PNG, owner screenshot, and decoded
source images. The existing `*.local` ignore rule excludes this directory.
The source file in Downloads is unchanged. Artwork and font payloads are not
included in tracked documentation or public fixtures.

The supplied gallery screenshot is a visual reference, not a pixel comparison
baseline. The fresh full-resolution export is the initial browser baseline.
Its capture does not establish cross-platform parity or repeat-render
determinism; those remain prototype checks. Record browser/OS versions and
repeat exports when establishing automated visual tolerances.

## Composition inventory

All 15 layers are visible. The project has no 3D, custom shaders, masks,
graph-only merge/repeat nodes, or animation.

| Component | Current source |
| --- | --- |
| Canvas | Square, transparent global background, seed 4242 |
| Fill | `#5e30eb`, full opacity |
| Emoji source | 100 seeded items, size 44-106, 8 glyph choices |
| Glitch | Amount 24 |
| Grain | Amount 100 |
| Noise Warp | Amount 100 |
| Vortex | Amount 20 |
| Tear | Amount 4, size 4 |
| Scanlines | Amount 38, line width 4 |
| Chromatic aberration | `ca = 27` |
| Main image | Embedded 2048 x 2048 PNG with transparency |
| Advisory label | Embedded 529 x 331 PNG |
| Text | Four editable layers: title and artist, each with a separate shadow |
| Font | One embedded TTF referenced by all four text layers |
| Export | PNG, scale 3, cover target; observed output 3000 x 3000 |

The phone image already contains visible grain/color treatment. Preserve those
pixels as an image asset; they are not additional editable native effects.
The seven live effect layers operate on the emoji/background branch before
the phone, label, and text are composited above it.

## Preserve graph semantics

There are 15 edges forming one chain to `__export__`:

```text
Fill -> Emojis -> Glitch -> Grain -> Noise Warp -> Vortex -> Tear
-> Scanlines -> Chrom. Ab. -> Image -> Parental Advisory Label
-> Вайбер Shadow -> Вайбер Text -> Вялый Джо -> Вялый Джо copy
-> __export__
```

The title shadow is last in `document.layers` but precedes the white title in
the graph. A native implementation that draws only the layer array would
change overlap. Use the graph export target when the graph exists. Preserve
both the layer array order and graph topology on round trip; do not rewrite
one to match the other.

## Portability checks specific to this source

- Keep all four text layers editable. Test Cyrillic glyph coverage, positioning,
  font metrics, rasterization, and shadow offsets using the embedded font.
  An outlined or flattened derivative cannot prove editable text parity.
- The embedded font decodes to 30,764 bytes, while metadata reports 30,765.
  Preserve the source and record this discrepancy; do not reject or truncate
  the font solely from its declared byte count. Actual font parsing still
  needs validation in the native prototype.
- Emoji glyphs currently use the system font fallback chain beginning with
  Apple Color Emoji. Seeded placement alone does not guarantee identical emoji
  pixels in every browser/OS. Initially compare Chrome on this Mac with native
  macOS; define a portable emoji rendering policy before claiming broader web
  parity. Do not redistribute system font files as an incidental fix.
- Match seeded random arithmetic, blend/alpha behavior, image placement,
  sampling, resolution scaling, and effect order. Canvas effects, GPU effects,
  and pixel transforms are all exercised by this source.
- The package embeds both images and its imported text font. No network assets
  are required for those resources, but the system emoji dependency remains.

## Implementation checkpoints

1. **Document and command proof:** add a Rust core with native and WASM adapters.
   Load this exact package, preserve all fields/assets, and change the Scanlines
   layer (`layer-1780509894426-491`) from 38 to 50. Undo restores 38; redo
   restores 50. Compare complete document state across builds and save/reopen,
   allowing only explicitly declared package metadata changes.
2. **Native rendering proof:** render the full Viber composition in a minimal
   SwiftUI macOS application, including editable text and all seven effects.
   Build up diagnostic stages for font/image placement and background effects,
   but do not describe a partial or flattened image as full rendering support.
3. **Shared rendering proof:** evaluate the same renderer in browser WASM and
   native macOS. Compare each with the captured Chrome reference at the same
   output dimensions, then test the changed parameter and undo visually.
4. **Round-trip proof:** Web -> Mac -> Web preserves the composition, assets,
   graph, and editable text. Export and preview agree within recorded,
   owner-reviewed tolerances. Report timings and peak memory on the actual Mac.

Checkpoint 1 targets Apple Silicon (`arm64`) and macOS 14 or later.
Reproducible build/test commands and evidence are below.
Before claiming checkpoint 3, verify the visual criteria below and
repeat-render stability. Pixel-difference metrics are diagnostic, not an exact-match gate. A bounded pilot does not establish full renderer or
editor feature coverage.

This source requires no 3D support for the first proof. A native node-canvas UI,
other operating-system clients, cloud sync, publication, and a full editor UI
rewrite are outside the pilot. The existing web renderer remains available
until replacement behavior is verified.


## Checkpoint 1 implementation and validation (2026-09-23)

`crates/artifact-core` owns package loading, a bounded 50-command undo/redo
history, Scanlines edits, summaries, and JSON export. UniFFI 0.32.1 exposes
that session to Swift; wasm-bindgen 0.2.128 exposes the same implementation to
JavaScript. This initial command checkpoint did not include a renderer; the
subsequent rendering checkpoint below adds one. Migration, cloud operations,
and production web editor integration remain outside this pilot. Unknown fields and numeric representations are
preserved; JSON whitespace is normalized. Package metadata is unchanged.
History stores parameter patches rather than copies of embedded assets.

The loader accepts project packages v1 containing schema 3 documents, up to
64 MiB. It validates the envelope and basic layer identity, not the full graph,
fonts, or image payloads. Unsupported schemas are rejected before replacing
an open session. Only existing valid Scanlines parameters can be edited;
other capabilities are preserved without being interpreted.

`apps/macos` contains a SwiftUI/AppKit shell with a layer list, Scanlines
inspector, undo/redo, native file panels, atomic Save Copy, and unsaved-change
confirmation. `packages/artifact-core-web/demo` provides an isolated React/WASM
shell with equivalent commands and file download. The rendering follow-up below adds artwork preview and PNG export to both
shells. The existing `/app` remains on its current
TypeScript state and renderer. File parsing and commands run synchronously;
large-package UI latency and memory have not yet been profiled.

### Reproduce locally

Requires Node/npm, Rust with the WASM target, and Xcode/Command Line Tools on
an Apple Silicon Mac. This is a local optimized pilot app with an ad-hoc signature, not
a notarized distribution. Install the matching toolchain adapters once:

```bash
npm ci
rustup target add wasm32-unknown-unknown
cargo install wasm-bindgen-cli --version 0.2.128 --locked --root tools.local
npm run build:core-pilot
npm run test:core-pilot
npm run dev:core-pilot
```

The build accepts `-- wasm` or `-- macos` for one target. Generated bindings,
Rust outputs, the `.app`, and local tools are ignored. The app bundle is
`apps/macos/.build/Artifact Core Pilot.app`. The web demo listens on localhost
port 4186. The conformance command requires both builds; WASM is executed in
Node, Swift through the compiled UniFFI conformance executable.

The synthetic fixture runs without private assets. To include the selected
Viber package, place it at
`tests/fixtures/core-parity/viber.local/source.artifact`, or run:

```bash
npm run test:core-pilot -- --fixture '/path/to/project.artifact' --layer layer-1780509894426-491
```

The supplied fixture command expects Scanlines initially at 38. Results are
written to ignored `test-results/core-pilot/`, including changed and restored
packages and `report.json`.

### Initial command-pilot observations (superseded where noted below)

- Initial six Rust command tests passed: complete-package round trip, atomic errors, history
  branching/no-op behavior, invalid input, numeric preservation, history limit.
- Synthetic and real 15-layer Viber packages passed Rust, Swift/UniFFI, and WASM
  comparisons for open, edit 38→50, undo→38, redo→50, and reopen→50. Each full
  result matches an independent expected package; serialized strings also
  match across all three adapters. Original image/font data stays intact.
- Existing web document command/history/package regression tests passed (58 tests).
- Native app and WASM builds passed. Rust formatting and Clippy, TypeScript
  typecheck, and scoped frontend lint/format checks passed.
- The local browser shell loads, but interactive file/edit/download acceptance
  is incomplete: the Chrome extension denied file upload access. The normal
  file-panel fallback was not completed because the user was using Chrome.
- After explicit owner confirmation, the native GUI launched on this Mac.
  Open showed all 15 Viber layers and Scanlines 38; Apply changed it to 50,
  Undo restored 38, and Redo restored 50. The unsaved marker tracked those
  changes. Save Copy through NSSavePanel wrote
  `test-results/core-pilot/viber-native-ui-20260923.artifact`; the complete
  saved package exactly matches the expected single-parameter change, and
  the original package hash is unchanged. Evidence summary:
  `test-results/core-pilot/native-ui-report.json`.
- After Save, native UI automation repeatedly timed out, including after
  rebinding and resetting the tool. The process remained alive; a two-second
  sample showed its main thread waiting in the normal AppKit event loop.
  This does not prove every UI path remains responsive. Reopen through the
  GUI, keyboard shortcuts, close/quit guards, and a screenshot remain
  unverified. No code change was made based on this inconclusive tool failure.
- Fallow changed-code audit ran in report-only mode: four dead-code findings
  (the Vite HTML entry point, its component/style, and the component export
  were not recognized as reachable) and three complexity findings in the demo
  component/load/command handlers. No cleanup was applied. The import path
  `demo/index.html -> main.tsx -> Pilot.tsx/style.css` is present; a future
  adoption should configure the entry and add UI coverage. Local report:
  `test-results/core-pilot/fallow-audit.json`.
- These initial observations preceded rendering and GUI round-trip verification
  below. No production release gate is claimed.


## Rendering follow-up (2026-09-23)

The Viber composition now renders from its editable document. It does not use
the captured reference PNG as a plate, outline the text, or substitute a
flattened derivative. CoreText reads the embedded TTF and CoreGraphics decodes
the two embedded PNGs. The font's middle-baseline placement uses the em square,
verified against this Viber reference; general typography coverage is pending.

### Boundaries and coverage

- Rust `render_plan_json` resolves a linear graph from the export target,
  preserves layer/graph order in the source, and generates seeded emoji stamps.
- Rust `effect_rgba` processes straight-alpha RGBA: Glitch, Grain, Noise Warp,
  Vortex, Tear, Scanlines, and Chromatic Aberration. Remapping interpolates
  premultiplied samples. The three former GLSL effects are CPU ports; shader
  precision and sampling can differ from the browser GPU implementation.
- Swift `PilotRenderer` owns transient CGContext/CoreText resources. A serial
  worker actor renders away from the main actor, checks cancellation between
  layers, and drops superseded results. SwiftUI displays the actual 3000px
  render; Export PNG writes that same image with an atomic file write.
- The experimental web adapter uses the same Rust plan and effect kernels via
  WASM, with browser Canvas/FontFace source rasterization. It invalidates stale
  previews, frees fonts/object URLs, and downloads the same PNG blob displayed
  by the preview. Browser file/render/download acceptance for Viber subsequently
  passed in the GUI round trip below, with owner-assisted file selection.
  The isolated WASM kernel tests remain Node-based.
- The initial web renderer executed effect kernels on the main thread. The
  worker follow-up below moves all seven CPU effects off that thread while
  retaining the same Canvas source/composition path. Latency and memory budgets
  still need broader profiling before production adoption.
- Rendering is limited to square documents up to 3000px, normal source blending,
  embedded image/font assets, supported layer kinds, and one-input linear graphs.
  Unsupported graph nodes, ports, cycles, active effects, and alpha masks fail
  explicitly; the document remains intact. There is no native node canvas or 3D.

### Evidence and reproduction

After `npm run build:core-pilot` and `npm run test:core-pilot`, with the private
Viber fixture and captured reference installed, run:

```bash
npm run test:core-render
```

This executes the native render CLI and WASM bindings, checks all seven effect
kernels on an 8x8 RGBA fixture, renders 3000px original/changed/restored documents,
and compares pixels. The fixture is intentionally small for binding conformance;
it is not a comprehensive image-quality test. Five additional Rust tests verify
render order, input rejection, Scanlines alpha behavior, edit/undo plans, and
seeded repeatability. All 11 Rust tests, document conformance, TypeScript checks,
scoped lint/format, and Clippy passed.

Observed on this Apple Silicon Mac (macOS 26.6.2):

| Check | Result |
| --- | --- |
| Seven effect kernels, Swift vs WASM | Exact byte equality on the contract fixture |
| Native full Viber render + PNG encode | About 2.3 seconds at 3000 x 3000 |
| Undo restores rendered original | All 9,000,000 pixels identical |
| Scanlines 38 -> 50 | 2,239,546 pixels change; max channel delta 31 |
| Native vs captured Chrome reference | Mean absolute RGBA channel delta 12.293 / 255 (diagnostic only) |
| SwiftUI preview and PNG export | Observed in the running app; exported PNG byte-identical to native CLI |
| Native GUI Apply and Undo | Both observed to rerender, returning to Scanlines 38 |

### Approved visual tolerance (2026-09-23)

The owner accepts small differences in noise and other rendering details for
this pilot. Exact pixel matching with the captured Chrome reference is not a
completion requirement. This is a qualitative tolerance; no numerical error
threshold has been approved.

Composition, layer order, text content and placement, image assets, transparency,
and the visible response to edits must be preserved. Missing layers or material
layout/typography changes do not qualify as minor rendering differences.
Preview/export consistency and deterministic undo remain required within each
client. Cross-client pixel-difference metrics are diagnostic and do not replace
these checks.

The comparison shows differences in the emoji/effect background, rasterization,
and image sampling. Minor differences alone no longer block this pilot. The bounded Viber
browser workflow and Web -> Mac -> Web composition checks passed below.
This tolerance does not authorize replacing or deploying the production renderer.

Ignored evidence in `test-results/core-pilot/`:

- `viber-native-3000.png` and `viber-native-ui-render.png`;
- `viber-native-changed-3000.png`, `viber-native-restored-3000.png`;
- `render-comparison.png` (Chrome left, native right);
- `render-comparison.json` and `kernels-swift.json`.

The next fidelity step is a browser-side run with the same Rust kernels to
separate platform text/emoji rasterization from the legacy GLSL effects. Keep
all original editable text, image/font payloads, and document metadata intact.


Final scoped review: the Vite production bundle also builds successfully.
Fallow remains report-only; `test-results/core-pilot/fallow-render-audit.json`
records the demo entry-point reachability warnings and complexity in the
prototype component/load/command handlers and Canvas adapter. No automatic
cleanup or production renderer replacement was performed.


## Sequential file round trip (2026-09-23)

`npm run test:core-roundtrip` passes the saved output of each adapter to the
next, using the private Viber fixture and the previously built bindings:

1. WASM opens the source at Scanlines 38 and saves 44.
2. Swift/UniFFI opens that file at 44, edits to 50, undoes to 44, redoes to 50,
   and saves a reopened copy.
3. WASM opens the Swift copy at 50, edits to 62, undoes to the exact Swift
   serialization, redoes to 62, and saves.
4. Swift reopens the second WASM file at 62.

The complete package is checked against the source after every step: only the
intended Scanlines value changes. All 15 layers, graph, editable text, embedded
font/image payloads, manifest and unknown fields are preserved. Opening a saved
file starts fresh undo history. Results and intermediate packages are ignored
under `test-results/core-pilot/roundtrip/`.

This automated test proves sequential file interoperability through WASM in
Node and the Swift/UniFFI CLI. Separate GUI evidence follows; the adapter test
alone does not prove browser/native UI behavior. The original source SHA-256 remains
`2334ccfa31273705918475869e9ebb759ad13078df8f4914f4940d9a5d7d6c08`.


## Verified GUI round trip (2026-09-23)

Completed with Chrome at `http://127.0.0.1:4186/` and the local SwiftUI app:

1. Chrome opened the original Viber package, displayed all 15 layers and the
   rendered composition at Scanlines 38, and downloaded its 3000 x 3000 PNG.
2. Chrome Apply changed Scanlines to 44. Save Copy downloaded a package whose
   only change from the source was that value. Undo restored 38 and produced
   a PNG byte-identical to the first export; Redo restored 44.
3. SwiftUI opened that actual browser download at 44 and rendered the cover.
   Apply changed it to 50; Undo restored 44; Redo restored 50. Save Copy wrote
   `viber-mac-roundtrip-50.artifact`. Full-package comparison again found only
   the expected Scanlines change. Native PNG export was 3000 x 3000 and
   byte-identical to the previously verified native CLI render at 50.
4. Chrome opened that actual Mac save at 50 with all 15 layers and rendered
   the composition. Save Copy downloaded a package byte-identical to the Mac
   file, and Export PNG downloaded the 3000 x 3000 browser output.

The owner selected the source and returning Mac file in Chrome because the
extension denied direct file selection and native-picker automation lost focus.
The remaining edits, native import/save and browser downloads were exercised
through the actual controls. No file-filter fix was retained: the original
input successfully loaded both packages after manual selection. Captured
browser warning/error logs were empty.

The final Web/Mac exports show the same composition, text placement and images;
background/emoji rasterization and sampling differ. Mean absolute RGBA channel
delta is 6.793 / 255, recorded as a diagnostic rather than a pass threshold.
Source package and embedded assets remain intact and editable.

Evidence in `test-results/core-pilot/roundtrip/`:

- `gui-report.json`: observed GUI sequence and assertions.
- `gui-web-44.artifact`, `gui-mac-50.artifact`, `gui-web-return-50.artifact`:
  actual saved/downloaded packages.
- `gui-web-38.png`, `gui-web-undo-38.png`, `gui-mac-50.png`,
  `gui-web-return-50.png`: actual PNG exports.
- `gui-web-mac-comparison.png`: side-by-side final exports at Scanlines 50.

This closes the bounded Viber interoperability workflow, not full editor or
release acceptance. Peak memory, representative performance budgets, general
font/layout cases, unsupported graph/effect features, additional browsers,
and close/quit guard coverage remain outside this proof. Web CPU effects were
subsequently moved to a worker as described below. No commit, publication or
deployment was made.


## Web effect worker (2026-09-23)

All seven CPU effect kernels now run in a dedicated module Web Worker through
`src/workers/effect.worker.ts`. The main thread still owns document commands,
render planning, text/font/image drawing and Canvas composition. Each effect
transfers its RGBA ArrayBuffer to the worker and transfers the result back;
the detached input ImageData is never reused. No DOM, canvas or worker objects
enter document state. There is no silent main-thread effect fallback.

One `EffectClient` belongs to one render job. It lazily starts a worker at the
first effect, initializes WASM once, processes effects sequentially, and
terminates on completion, failure or cancellation. The existing useArtwork
AbortController now stops running WASM immediately when a new edit invalidates
the old render. Request IDs reject stale responses; output type/length are
validated. Startup, transport and worker errors settle the pending promise;
a 60-second timeout per effect prevents an endless rendering indicator.

Validation:

- `npm run test:core-web`: 10 tests pass for transferable buffer dispatch,
  worker reuse, pre-abort/in-flight abort, stale responses, concurrent-use
  rejection, worker/protocol failures, timeout and startup/transfer errors.
- Workspace TypeScript, scoped ESLint/Biome and Vite production build pass.
  The bundle emits a separate worker chunk and the WASM asset.
- Chrome rendered the real Viber Mac-copy at Scanlines 50. Its downloaded PNG
  is byte-identical to the saved pre-worker Chrome PNG (3000 x 3000).
- During a new render at 51, selecting the title layer updated its inspector
  while `Rendering artwork…` remained visible. Further edits/Undo returned to
  50; the final PNG again matched the pre-worker export byte for byte.
- No warning/error entries were captured from the browser during this check.

Evidence: `test-results/core-pilot/worker/report.json`, `worker-50.png` and
`worker-cancel-undo-50.png`. The browser check used the actual UI with owner
assistance selecting the local file; it was not a headless benchmark.

The observed interaction proves the tested controls can respond during effect
work, not a frame-rate or maximum-latency guarantee. Main-thread image decode,
Canvas read/write/compositing and render-plan serialization still have costs.
Worker startup is intentionally per render to bound cancellation and memory
lifetime; pooling, full OffscreenCanvas rendering and performance budgets are
separate optimizations. No production editor renderer or native code changed
in this worker slice.

## Text editing slice (2026-09-23)

Both clients now expose content, size, hex color, and X/Y position for existing
text layers. Rust owns the partial `set_text` command and validates the whole
patch before applying it. One Apply creates one history entry shared with
Scanlines edits. Unknown fields, embedded assets, transforms, font references,
and untouched numeric representations survive edit/save/undo unchanged.
Client-only drafts send changed fields; position is displayed as percentages.

Supported values are text up to 16 KiB without NUL, size 1–540, `#RRGGBB`
color, and normalized X/Y from -2 to 3. Empty text and multiline text are
supported. Empty or semantically unchanged patches do not erase redo history.
Native glyph validation excludes whitespace from missing-glyph checks.

Validation completed:

- 16 Rust tests pass, including atomic rejection, missing-field restoration,
  no-op/redo preservation, mixed Scanlines/text history, and render-plan undo.
- `npm run test:core-text` passes complete-package comparisons through Rust,
  WASM, and Swift/UniFFI; then a sequential WASM -> Swift -> WASM handoff.
  Native changed/multiline PNGs render at 3000 x 3000. Undo restores the
  baseline native PNG byte for byte. Evidence: `test-results/core-pilot/text/report.json`.
- Existing command and Scanlines round-trip checks, 10 worker tests, Clippy,
  TypeScript, scoped lint/format, native/WASM build, and Vite build pass.
- Chrome GUI: selected `Вайбер Text`, applied `ВАЙБЕР 2`, size 60,
  `#ffcc66`, X 50%, Y 15%; Undo restored all original values and Redo restored
  the edit. Actual downloaded package matches the original with exactly those
  five changes; PNG is 3000 x 3000. Evidence: `gui-web.artifact`, `gui-web.png`,
  and `gui-report.json` under `test-results/core-pilot/text/`.

Native text GUI open/render and controls now pass. With manual file selection,
the real Web copy opens with all 15 layers and the changed title. CUA read
all five expected text values, applied `ВАЙБЕР 3`, size 58, `#aaffcc`, X 51%,
Y 16%, then verified Undo restored the Web values and Redo restored the Mac
edit. The owner completed Save Copy as `viber-text-mac.artifact` and opened
it in Chrome. All five text values, 15 layers, Scanlines 38, and the rendered
composition were verified there. The final Web Save Copy is byte-identical
to the native saved file; the final Web PNG is 3000 x 3000. The original
source SHA-256 is unchanged. This closes the bounded text-edit round trip.
Evidence: `text/gui-report.json`, `gui-mac.artifact`, `gui-web-return.artifact`,
`gui-web-return.png`, and the owner's `gui-web-return-user.png` screenshot.
File-panel completion required owner assistance. A new native PNG export was
not collected for this GUI text slice; native renderer checks are listed above.

System-panel automation remains unreliable: CUA sometimes reports inactive
Open/Save buttons, loses the window, or times out. A two-second process sample
found the main thread waiting in the normal AppKit event loop; there was one
app process, and LaunchServices resolved the actual file and extension to the
same dynamic type. Manual Open succeeds. These observations do not justify
a loader/renderer code change or establish the automation failure's root cause.
Evidence is under `test-results/core-pilot/window-diagnostics/`; the owner's
successful-open screenshot is `text/gui-mac-open-user.png`.

This is a properties editor for existing layers. Font selection, text creation,
drag handles, full typography/layout parity, and production editor integration
remain outside this slice. Viber shadows are separate text layers: editing the
title does not automatically rewrite its shadow. Glyphs outside the embedded
font's coverage are not promised. The original supplied package is unchanged.

## Working preview and independent export (2026-09-23)

The owner approved starting the next increment after checkpoint
`checkpoint/web-macos-viber-text-2026-09-23`. Both clients now render working
previews at 1000 x 1000, and Export PNG renders the current document afresh at
3000 x 3000. Export never downloads or upscales the working preview. The
native PNG encoding step runs on the render actor; file writing is atomic.

Preview and export own separate cancellable jobs. Committing an edit, Undo,
Redo or a successfully opened project invalidates both immediately. Web
invalidation happens at the mutation boundary before React effect cleanup;
completion after worker work or PNG encoding cannot publish an old revision.
Native revision checks prevent obsolete images from replacing the preview
and obsolete exports from overwriting a destination. Export errors clear the
busy state and permit retry. Native cancellation is cooperative between
layers; a running Rust FFI kernel finishes before observing cancellation.

The same Rust plan preserves graph order, assets, normalized placement and
effect parameters. Chromatic aberration is the exception requiring size
conversion: its stored pixel offset is calibrated to the existing 3000px
export, so the plan scales it for smaller renders without touching the
document or the standalone effect-kernel API. Grain, scanline rounding and
font rasterization can vary with resolution. Preview is a working image, not
a pixel-exact downsample of the final export; no effects are omitted.

Validation so far:

- 17 Rust tests and 14 Web worker/job tests pass; Clippy, scoped lint/format,
  TypeScript, native/WASM and Vite production builds pass.
- `npm run test:core-preview` passes controlled late completion, edit/open
  invalidation, failed export and retry checks through the actual native
  ProjectModel; it also runs the real preview/export renderer. Its final PNG
  is byte-identical to the pre-change native 3000px output.
- Three native samples per size: median 0.508s at 1000px versus 3.866s at
  3000px, including PNG encoding. Peak RSS medians were approximately 81 MB
  and 520 MB. These isolated-process measurements do not establish UI latency
  or app-wide memory budgets. Evidence: `test-results/core-pilot/preview/`.
- Updated Web and Mac GUI acceptance is pending manual file selection.

Production renderer/state ownership, adaptive Retina sizing, keeping an old
frame visible during work, full-resolution idle refinement, and persistent
render caches are outside this increment. There is no new release or deployment.
