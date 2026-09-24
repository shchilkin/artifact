# Native 2D render foundation (P06, issue #266)

This work began from the coordinator-approved stacked base
`1c20ec2186bbd0fe3b2e7aa8465dc09a28bcbf5e` (P01, P02 and P03 present).
The main Web renderer is unchanged. Native rendering now accepts the four Web
canvas aspects, transparent output, the declared Canvas 2D blend modes,
cover/contain/free/tile image placement, and embedded-font text. The native
source/effect/graph registration seam is in `NativeRenderRegistry.swift`;
`NativeFillModule.swift` and `NativePilotEffectModule.swift` demonstrate
separate-file implementations against `NativeRasterTarget`. Graph dependency
ordering still comes from the shared core and remains limited to a linear
layer chain until P09.

## Runtime contract

The shared Rust `render_plan_json` validates aspect/dimensions and supported
layer parameters, then emits a transient plan. Swift's `NativeRenderPlan`
validates its shape. `RenderWorker` owns a `NativeRenderResources` cache across
frames; its keys include the complete embedded source URL, so changing image
or font bytes gives a new decoded resource. The cache retains at most 96 MiB
of decoded image/font and source-string estimates. Assets larger than the
budget are usable during a render but are not retained afterward. The cache
and all CoreGraphics objects stay outside serialized document state.

`NativeRasterTarget` exposes a drawing context, dimensions, seed, decoded
resource lookup and straight-RGBA pixel-kernel boundary to independent source,
effect and graph modules. It does not write document state. Future modules
register by kind or family and validate their own parameters; the current
seven-effect Rust kernel is the final fallback. Graph registration is an
extension point, not an assertion that graph utility rendering is complete.
Effect dispatch selects the first module accepting a layer, so acceptance is a
complete-layer contract: a family module must reject a plan with any active
parameter it cannot render. Ordered composition for mixed effect families is
required before P12–P15 modules are integrated together.

The bitmap is 8-bit sRGB, premultiplied-last RGBA. Source colors are six-digit
hex interpreted in sRGB. CoreGraphics source layers composite in that context
with a declared blend mode and layer opacity. Rust effect kernels receive straight
sRGB RGBA and return the same; the target unpremultiplies and premultiplies at
the boundary with nearest-even rounding. Fully transparent RGB is zeroed.
PNG encoding preserves alpha. A checkerboard is native UI chrome and is never
drawn into output. CG image antialiasing and color blending can differ from
Chrome at edges; decoded pixels, not compressed PNG bytes, are compared.
The seven pilot effects still transform the current bitmap directly; their
effect-layer opacity/blend behavior is not yet a separate compositor pass.

The native settled preview fits within 1000 pixels on the longest axis (4:5
becomes 800 × 1000); pointer drafts fit within 500 pixels and coalesce for
16 ms. The selection outline moves on the UI event path without waiting for
the bitmap. The renderer actor works off the main actor. A durable edit or
open advances the model render revision, cancels older preview/export tasks,
and only presents or writes results whose captured revision still matches.
The raster checks cancellation at layer boundaries and every 64 rows of CPU
pixel conversion. A single CoreGraphics draw or Rust kernel may finish after
cancellation, but its result cannot replace a newer frame. No-op commands do
not advance the render revision. The export path creates a fresh plan from the
current committed session and does not reuse a draft frame.

P07 still owns export scales 1–3, JPEG, packages and portable asset references.
This P06 path keeps the existing 3000 × 3000 square PNG behavior and uses the
Web base dimensions for non-square PNGs. It does not claim full export parity
for a non-square document requesting scale 2 or 3. P09 owns graph branch
caches; this foundation caches decoded resources only. Image/font readiness,
dimensions, seed, layer parameters, upstream graph dependencies and view state
must enter future per-target cache signatures. The revision is a presentation
guard, not a substitute for that dependency key.

A pointer transform uses a transient 500-pixel draft. Committing the original
values cancels that draft and schedules the settled preview even though the
core document revision, undo history and dirty state do not change. A late
draft completion cannot replace the settled preview.

## Measurements and comparison, 2026-09-24

Actual host: MacBook Pro Mac17,7, Apple M5 Max, 36 GB memory, macOS 26.6.2
(25G83), AC power. The headless harness did not expose display scale; none is
claimed. Toolchain: Node 26.8.1, npm 11.19.0, Rust 1.95.0, Swift 6.3.3/Xcode
26.6. This is a different and faster class of hardware from the proposed M3
Pro/18 GB target in [the P01 contract](./native-2d-parity-contract.md).

The unchanged base source was compiled separately and measured before P06
edits on the public P01 embedded-font scene. Five fresh headless model runs
from `previewTransform` call to receipt of the 500-pixel draft bitmap took
72.3–75.0 ms (median 73.8 ms), including its fixed 70 ms timer. Five P06
runs took 17.9–20.3 ms (median 19.8 ms). This measures model-to-bitmap
response, not mouse-to-display or frame rate. On the same host, isolated
`render-check` render-plus-PNG medians at 1000 × 1000 were 11.2 → 13.1 ms
for the text scene and 31.8 → 38.6 ms for the public text-plus-scanlines
derivative. The latter raster cost regressed; the shortened draft scheduling
improved this bounded interaction despite it. Five-run post-change median for
the combined 1080 × 1350 scene was 23.9 ms. These small scenes do not prove
the P01 100-node, viewport frame-time or app-memory targets.

Single fresh `render-check` process peak RSS, measured with macOS child
`ru_maxrss`, was 19.2 MB for text 1000², 40.4 MB for text plus scanlines
1000², and 21.8 MB for the combined 1080 × 1350 scene. These are process
peaks, not live app RSS or the decoded-cache 96 MiB budget. Display frame
times, repeated open/close retention, 100-node memory and full export targets
remain for P17.

The comparison fixture is
`tests/fixtures/native-2d/render-foundation.artifact.json` (SHA-256
`7fa7db8bc58469b7a921d71d5cd72cce34289557e87f25e006939db0888213b1`):
4:5, embedded Covered By Your Grace title, alpha PNG and overlay blend. An
independent real main-Web `/app` import and export on Web source
`ca2a1e2b408998436414b2efde69777b65e249f5` produced a 1080 × 1350 PNG
(SHA-256 `34f5e98fa55906abc55857a281e77e48698fd1f6c05c087a6b068bea9ed2a36b`).
The native `render-check` path produced the same dimensions, identical corner
RGBA `[38,44,67,255]`, center `[36,155,192,255]` versus Web
`[36,154,192,255]`, and white-title bounds x316/y257/447×86 versus Web
x317/y257/447×88. Decoded full-image mean RGB error was 0.51, 99th
percentile 8.33 and alpha differed at zero pixels. These results satisfy the
P01 proposed bounds for this composition; they do not establish all-scene
parity. The P01 pure alpha fixture matched Web transparent corners and center
`[30,180,220,220]`; the layered blend fixture center was native
`[112,128,184,255]` versus Web `[113,128,185,255]`. The embedded-font P01
ink bounds after baseline correction were native x62/y336/874×171 versus Web
x63/y338/874×172. No fallback font was used by native.

The real native SwiftUI app built from `36e51a95efc2951e48946fd49e9fd5fda36802a1`
loaded the combined project and displayed its 800 × 1000 4:5 preview and
four layers. Editing the title to `NATIVE VERIFIED` updated the preview;
dragging changed X/Y from 50/23 to 59.1885728433/31.4561951251. Two Undo
actions restored both the position and `NATIVE COLOR` title, leaving the
document clean. The native GUI Export PNG path produced a 1080 × 1350 file
(SHA-256 `30fd4f0e1f2b62e5510c7e6ac7c7248e52584437f6ad8f1a34c1f91d0fac319d`).
Its bytes matched the same fixture rendered through the native harness.
The later blend-mode validation fix rejects malformed input and leaves valid
scene raster behavior unchanged. The decoded pixel comparison above therefore
also applies to this GUI export.

Run `npm run build:core-pilot -- macos` then `npm run check:core-native` for
the native harness. It covers four aspect outputs, transparent and
semitransparent pixels, five blended layers, embedded-font ink bounds and
ordinary plus subpixel image tiling. The model check covers out-of-order
preview completion and stale export cancellation. `npm run
quality:native-2d-contract` checks fixture and inventory structure. The
capability manifest marks raster aspect/blend/transparency implementations;
its acceptance fields remain planned because P07/P09/P17/P18 still own full
workflow, graph, performance and integrated-client gates.
