# Artifact Runtime (experimental)

Status: experiment. Tracking: shchilkin/artifact#400. Lives on `experiment/runtime`; never merged into `development` or shipped in product
releases. Effect PRs target `experiment/runtime`.

## Goal

Play an Artifact cover on a web page so that its layers move over time and, where a document asks for it, react to
the visitor (pointer position, pointer speed, hover, click, scroll). First consumers: the portfolio (Astro, static)
and the Vantaa Underground site (Next.js, React, Three.js).

## Why not run the editor renderer per frame

`renderDocument` is built for editor previews and one-off export: every node draws into a fresh canvas, every GPU
pass uploads and reads back, Three.js renderers are created per call, and `GraphRenderCache` is invalidated
downstream of any animated parameter. About 35 effects are per-pixel CPU paths that cost tens to hundreds of
milliseconds at 1080px. The runtime therefore has its own real-time pipeline and reuses the editor's shader source,
not its render loop.

## Architecture

- **Package**: `packages/runtime` (`@artifact/runtime`), no React, no app stores, no IndexedDB.
- **GPU**: WebGL2 directly, no Pixi. A ping-pong framebuffer chain keeps every pass on the GPU; nothing is read back
  per frame.
- **Shader reuse**: editor GPU effects are Pixi filter fragments that only use `vTextureCoord`, `uSampler` and
  `inputClamp`. The runtime provides a compatible header (`inputClamp = vec4(0, 0, 1, 1)`), so the editor's
  fragment strings run unchanged. Effects that are CPU-only today are ported to GLSL in the runtime; the editor keeps
  its CPU path until a later decision.
- **Live package**: Artifact exports a cover as plates plus a live chain:
  - _plates_: rasters for everything the runtime does not animate (text, images, 3D, CPU-only effects that stay
    baked), rendered by the editor at export time so fonts and assets are pixels;
  - _live chain_: the effect layers that run in the runtime, with their authored values;
  - _bindings_: which parameters move, driven by time tracks (`wave`, `step`, `pulse`, from the cover-motion
    experiment) and inputs (`pointer.x/y`, `pointer.speed`, `hover`, `click`, `scroll`).
- **Centred effects** (Vortex, Barrel, Radial CA, Zoom Blur, Vignette, Ripple, Kaleidoscope) get a `uCenter`
  uniform so the centre can follow the pointer. The default stays `0.5, 0.5`, so static output is unchanged.
- **Lifecycle**: `createArtwork({ canvas, livePackage })` → `start`, `pause`, `seek`, `resize`, `setInput`,
  `destroy`. Pauses off-screen (IntersectionObserver), honours `prefers-reduced-motion` (renders the authored still
  frame), caps device pixel ratio, and renders at most at the package's `maxRenderSize`.

## Package (issue #330)

`packages/runtime` exports:

- `createArtwork({ canvas, source, chain, frameUniforms?, maxRenderSize?, maxDevicePixelRatio?, reducedMotion?,
  observeVisibility?, scheduler? })` → `start`, `pause`, `seek(t)`, `resize(w?, h?)`, `setInput(name, value)`,
  `destroy`, a `state` snapshot (`status`, `time`, `frames`, `width`, `height`) and `ready`. It draws one resting
  frame once its shaders are ready; reduced motion keeps that still frame and never requests animation frames. Defaults: DPR cap 2,
  `maxRenderSize` 1080. It also takes `{ canvas, livePackage }` instead of `source` and `chain` (see Live package
  below); `createLiveArtwork` does the same, with the package's own bindings.
- `effectRegistry.pass(id, layer, { seed, width, height })` → a `ChainPass` (`id`, `fragment`, `uniforms`) from an
  authored `EffectLayer`, or `null` when the effect's amount is zero. Each `EffectDefinition` declares `id`,
  `fragment`, `amount`, `uniforms`, `centered` (reads `uCenter`, default `0.5, 0.5`) and `stochastic`. An effect the
  editor applies in two places declares `stages`: further fragments drawn after `fragment`, each over the previous
  draw, with the same uniforms and per-frame overrides. Its `ChainPass` carries them, so bindings, live packages and
  the exporter still address it as one pass.
- Seam for bindings (#332): `frameUniforms({ time, frame, inputs })` returns per-pass uniform overrides each frame;
  `setInput` fills `inputs`.

Shader reuse: shared fragments live in `@artifact/shared/effect-shaders` (`HEADER`, `NORM_UV`, `SAMPLE`,
`NOISE_FRAG`, `VORTEX_FRAG`, `BARREL_FRAG`, `MORPH_FRAG`, `DATAMOSH_FRAG`, `TEAR_FRAG`, `RGB_FRAG`). `apps/web/app/utils/pixiFilters.ts` and the runtime both import them, so the strings stay
byte-identical. Port further editor fragments the same way: move the string, import it in both places.

Pixi conventions the chain matches:

- Textures are uploaded unflipped and premultiplied, so `vTextureCoord.y = 0` is the top of the image; only the final
  pass to the canvas flips. `UNPACK_FLIP_Y` would mirror every effect vertically against the editor.
- `inputClamp` is the input's extent inset by half a texel, as Pixi sets it. With `(0, 0, 1, 1)`, about 1% of a 540px
  Noise Warp (hard edges) differs from the editor by more than 8 levels; with the inset the outputs match.

Shader compilation (issue #419): `createCompositeRenderer` compiles every shader, then links every program, and queries
nothing until the driver is done, since any status, uniform or error query before then waits for the compile. With
`KHR_parallel_shader_compile` the artwork polls `COMPLETION_STATUS_KHR` once per animation frame (`pollReady`) and only
then reads link status and uniform locations. Until then `state.status` is `'loading'`, nothing is drawn (the host
keeps showing its still), and `start`, `seek` and `setInput` apply to the first frame; `ready` settles when that frame
is drawn, and rejects with the compile log if a shader fails (`status` `'failed'`). Without the extension creation
waits for the driver and draws the resting frame at once, as before, and a failed shader throws from `createArtwork`.
Hosts and tests that read pixels after creation `await artwork.ready` first.
`tests/browser/runtime-compile.spec.ts` records long tasks over a cold start of every registered effect at 1080px:
on Chromium with Metal, about 90–270 ms in one task without the extension and none over 50 ms with it. Headless
Chromium without a GPU (CI) runs SwiftShader, which lacks the extension, so that check skips there.

`tests/browser/runtime-chain.spec.ts` imports the runtime source from the dev server (`/@fs/`), so no test route
ships in the app.

## Bindings (issue #332)

`createLiveArtwork({ canvas, source, passes, context, bindings, pointer?, ...artworkOptions })` is `createArtwork`
plus bindings. `passes` are the authored effects (`{ effect: 'noiseWarp', layer: { noiseWarp: 40 } }`); `bindings`
is plain JSON, validated by `parseBindings` / `compileLiveChain`, which throw a `BindingError` listing every problem
with its path (`bindings[2].to.field: noiseWarp has no field "noisewarp"; bindable fields: noiseWarp, seedOffset`).

```json
{
  "version": 1,
  "loop": { "durationSeconds": 6 },
  "bindings": [
    { "from": { "input": "pointer.x" }, "to": { "pass": 0, "uniform": "uCenter", "component": 0 }, "smoothing": 0.15 },
    { "from": { "input": "pointer.y" }, "to": { "pass": 0, "uniform": "uCenter", "component": 1 }, "smoothing": 0.15 },
    { "from": { "input": "hover" }, "to": { "pass": 0, "field": "vortex" }, "range": [20, 80], "easing": "easeOut" },
    { "from": { "track": "wave", "cycles": 1 }, "to": { "pass": 1, "field": "noiseWarp" }, "range": [-20, 20], "mode": "add" }
  ]
}
```

- **Sources**: a time track (`wave` in [-1, 1] with whole `cycles` and `phase`; `pulse` 0/1 with `at` and `length`
  in loop turns; `step` with `fps` and `stride`, unbounded) or an input. Tracks need `loop.durationSeconds`; a step
  track's `durationSeconds × fps` must be whole so the loop closes.
- **Targets**: `field` drives an authored field the effect lists in `EffectDefinition.fields`, and the effect's own
  uniform mapping turns it into uniforms (so `noiseWarp` → `uIntensity` exactly as the editor maps it). `uniform`
  sets a uniform directly after field bindings; vector uniforms such as `uCenter` need a `component`. `uCenter`
  exists only on centred effects.
- **Mapping**: a bounded source is normalised over its domain, eased (`linear`, `easeIn`, `easeOut`, `easeInOut`),
  mapped onto `range` (default: the domain), smoothed (`smoothing`, an exponential time constant in seconds on the
  scheduler clock), then `set` or `add`ed to the authored value and `clamp`ed. Bindings on one target apply in order.
- A pass with bindings stays in the chain even when its authored amount is zero, since it may move off zero.
- **Inputs** (`attachPointerInputs`, pure model in `createPointerModel`): `pointer.x/y` 0→1 across the artwork with
  `y = 0` at the top, as `vTextureCoord`, resting at 0.5; `pointer.speed` smoothed velocity in artwork lengths per
  second over `maxSpeed` (default 3), capped at 1; `pointer.dirX/dirY` the unit heading, kept when the pointer stops;
  `hover` eases 0→1 over 0.25 s with smoothstep (on touch it follows touch-down); `click` is 1 at a press and decays
  with a 0.5 s time constant, with `click.x/y`; `scroll` runs 0→1 from the artwork's top edge entering the viewport
  to its bottom edge leaving. Listeners are passive and removed on `destroy`; values from `setInput` take precedence.
- A stopped artwork redraws once when an input changes; a running one picks inputs up on its next frame.
- **Reduced motion** turns every binding off and the artwork shows the authored still, also when the preference
  switches on while playing.

## Live package (issue #333)

A live package is a folder (or a zip of one) with `manifest.json` and PNGs:

```json
{
  "format": "artifact-live-package",
  "version": 1,
  "size": { "width": 540, "height": 540 },
  "maxRenderSize": 540,
  "seed": 4242,
  "still": "still.png",
  "background": "background.png",
  "stack": [
    { "type": "plate", "file": "plates/0.png", "layers": [{ "id": "fill", "name": "Fill" }, { "id": "glitch", "name": "Glitch" }] },
    { "type": "chain", "passes": [
      { "effect": "noiseWarp", "layer": { "noiseWarp": 100, "seedOffset": 0 }, "source": { "id": "warp", "name": "Noise Warp" } },
      { "effect": "vortex", "layer": { "vortex": 20 }, "source": { "id": "vortex", "name": "Vortex" } }
    ] },
    { "type": "plate", "file": "plates/2.png", "layers": [{ "id": "title", "name": "Title" }] }
  ],
  "bindings": { "version": 1, "bindings": [] },
  "baked": [{ "id": "glitch", "name": "Glitch", "effects": ["glitch"], "reason": "glitch does not run in the runtime yet" }]
}
```

- **Stack**, bottom first (its order is the depth): the bottom plate is the editor's render of everything beneath the
  first chain, from a transparent canvas; each chain runs on the composite beneath it; each later plate is drawn over
  it (`source-over`). `background` (stack documents with a background colour) goes beneath the final composite, as
  the editor's stack export draws `doc.global.bg` under the rendered layers. Graph documents have none.
- **Passes** hold the authored fields the registered effect reads (`EffectDefinition.fields`); the runtime maps them
  to uniforms with `seed` and `size`. Bindings target passes counted bottom up across every chain.
- **`baked`** lists effect layers the editor rendered into plates, with the reason. **`fallback`** says why a package
  has no chain at all; its only plate is the still.
- `parseLivePackage` validates a manifest (paths stay inside the package, effects are registered and on at rest,
  bindings fit the passes) and throws `LivePackageError` listing every problem with its path, as `BindingError` does.
  `loadLivePackage(url)` fetches the manifest and decodes its images relative to it.

### Splitting a document

`planLivePackage` (`apps/web/app/components/runtime-catalogue/liveExport/livePlan.ts`) reads the layers in render
order: `doc.layers` for stack documents, the single line of layer nodes into the export node for graph documents. A
graph with merges, other node kinds, or extra inputs (materials, environments) is one still plate with a `fallback`.

- An effect layer is **live** when every effect it applies is in the runtime registry (the editor preset id is the
  registry id), and it is visible, unmasked and blended normally. Within a layer, passes follow the editor's order:
  Canvas 2D effects, then GPU filters. A newly registered effect moves into chains with no exporter change.
- Source layers (fill, emoji, text, images, 3D) with normal blending are drawn into plates, so fonts and assets are
  pixels.
- Anything else is a barrier: everything up to the last barrier is the bottom plate, because a baked layer above a
  chain would need the chain's pixels. Live layers beneath a barrier are baked with that reason.
- `approximate: true` moves unsupported effect layers beneath the live run they sit on (never across a source layer)
  and says so in `baked`. The resting frame then differs where the moved effects do not commute with the chain.

The Вайбер cover (fill, emoji, Glitch, Grain, Noise Warp, Vortex, Tear, Scanlines, Chrom. Ab., images, text): with
Glitch (#339), Grain, Noise Warp, Vortex, Tear (#340), Scanlines (#342) and Radial CA (#337) registered, nothing is
baked. The exact split is a base plate (Fill, Emojis), one live chain (Glitch → Grain → Noise Warp → Vortex → Tear →
Scanlines → CA) and the image/text plate; the approximate split is the same. Grain makes the resting frame a
statistics comparison: mean 0.15 and std dev 0.09 levels, histogram distance 0.009 at 540px in Chromium on macOS.

Radial CA is the editor colour pass's third step (sepia, infrared, CA, dither: `applyColorPass` in
`render/workers/effectPixelTransform.ts`), which `EDITOR_EFFECT_ORDER` follows. Its port (`CA_FRAG` in
`packages/runtime/src/effects/ca.ts`) reads whole pixels with the editor's rounding and edge clamping, scales the
amount by the render width over 540 as the editor does, and gets the render size from `inputClamp`.

Glitch (VHS streaks, `GLITCH_FRAG` in `packages/runtime/src/effects/glitch.ts`) is seeded but not stochastic in the
harness sense: the editor draws one `fillRect` band per unit of `glitch` (its slider runs to 24; the runtime caps at
100) from five LCG draws each, so the runtime runs the same LCG on the CPU per seed (`glitchBands`) and passes the bands as `vec4` uniform arrays. The shader takes each
band's analytic pixel coverage and composites it with the premultiplied screen blend, rounding to bytes after each
band; that blend is order-independent, so the bands are sorted by top edge and walked in groups of ten around each
row. Parity is by pixels (worst channel 1 level on every fixture and engine).

Chromatic split (`rgbSplit`, `packages/runtime/src/effects/rgbSplit.ts`) is the first two-stage effect. The editor
applies `rgbSplit` twice within one effect layer: first a whole-pixel offset among its Canvas 2D effects
(`applyRgbSplit` in `effectPixelTransform.ts`: red from `(x + o, y + o)`, blue from `(x − o, y − o)`, clamped, with
`o = round(rgbSplit × W / 540)`), then `RGB_FRAG` among its GPU filters (`uDir = rgbSplit × 0.0006` on both axes, in
texture coordinates). Canvas 2D effects always run before the layer's GPU filters. The runtime effect is one pass with
two stages in that order: `RGB_SPLIT_OFFSET_FRAG` (a GLSL port of the CPU offset, with the Radial CA port's
whole-pixel rounding and unpremultiplied recombination), then the editor's `RGB_FRAG`, imported unchanged. Parity is
exact on every fixture in Chromium, Firefox and WebKit on macOS (worst channel 1 level); dropping either stage fails
it (the harness self-test patches each).

The split direction is a runtime-only heading, `rgbSplitDirX/Y`, which editor layers do not have: `0, 0` is the
editor's diagonal (`(1, 1)` per axis in both stages), and any other vector is normalised to the diagonal's length, so
`rgbSplit` keeps the split size. Binding `pointer.dirX/dirY` to it turns the split to the pointer's heading; at rest
the pointer has no heading, so the authored still is unchanged. The exporter places `rgbSplit` at its Canvas 2D
position and bakes a layer with another active effect between the two editor stages (after `rgbSplit` among the
Canvas 2D effects, or a GPU filter up to `hueShift`), because the runtime draws both stages back to back. GPU time of
both stages at 540px: 0.07 ms (Chrome, Apple M5 Max).

Ripple (`ripple`, `packages/runtime/src/effects/ripple.ts`) ports the editor's CPU remap (`applyRipple` in
`effectPixelTransform.ts`, among the Canvas 2D effects after split tone): each pixel is copied from
`round(c + (dist + shift) × heading)`, clamped, where `c` is the frame centre, `dist` and `heading` the pixel's polar
offset from it, `shift = sin(2π × dist × rippleFreq / maxDist) × rippleAmt × W / 540 × 0.5` and `maxDist` the half
diagonal. `RIPPLE_FRAG` does the same with whole pixels, texel-centre samples and the render size from `inputClamp`,
and takes the sine of the fractional ring count to keep float error small. Parity at 540px: at most 0.003% of pixels
over 8 levels (single pixels on a rounding boundary), mean difference 0.006 or less, in Chromium, Firefox and WebKit
on macOS; mirrored rings or truncated sampling fail it (the harness self-test).

Two runtime-only fields leave the still unchanged at their defaults. `ripplePhase` (turns, default 0) moves the rings
outward, one wavelength per turn, so a step track adding whole turns per loop closes it. `rippleClick` (bind the
`click` impulse to it, unsmoothed) adds a ring packet around `uClickCenter` (bind `click.x/y`, default the centre):
the shader reads the click's age from the impulse (`age = −0.5 s × ln click`, the pointer model's decay), puts the
packet's front `1.5 × age` half diagonals from the click, and scales the authored peak shift by the impulse, so the
ring travels out and fades. GPU time at 540px: 0.12 ms (Chromium, Apple M5 Max).

Pixelate (`pixelate`, `packages/runtime/src/effects/pixelate.ts`) keeps the editor's mapping, `uBlocks = max(2,
round(width / pixelate))`, and its cell lookup: `PIXELATE_FRAG` moved to `@artifact/shared/effect-shaders`, built from
`PIXELATE_SAMPLE(blocks)`, and the editor imports it (its string is byte-identical). The runtime fragment,
`PIXELATE_REVEAL_FRAG`, adds a reveal mask around `uCenter` and calls the same lookup with a per-pixel block count, so
the editor fragment stays as it was. Two runtime-only fields drive the mask: `pixelateRadius` (`uRadius`, in frame
widths, default 0) and `pixelateSoftness` (`uSoftness`, default 0.2). Within the radius the image is sharp; across the
band beyond it each pixel's block is a whole number of eighths of the authored block (`smoothstep` of the distance,
rounded up), so blocks grow in rings with distance; beyond the band every pixel is the editor's. `uRadius = 0` reveals
nothing, so the resting frame is the editor's: at 540px at most 0.016% of pixels over 8 levels (photo), none on graphic
and text, in Chromium on macOS. The harness case eases the block size from 36px to the authored 12px and back over the
loop, binds `pointer.x/y` to `uCenter` and `hover` to `pixelateRadius`; the self-test rejects corner sampling and a
reveal at radius 0. GPU time at 540px: 0.07 ms (Chromium, Apple M5 Max).

### Export

`/dev/runtime` has a "Live package export" panel (development builds only): the sample cover or an opened
`.artifact`, 540 or 1080px plates, the approximate switch and optional bindings JSON. It plays the package next to the
editor still, reports the resting-frame parity, and downloads a zip.

`tests/browser/runtime-live-package.spec.ts` exports the sample cover (the Вайбер structure with a fixture image),
round-trips it through the zip, and checks the resting frame against `renderDocument` at 540px with the harness
tolerance (statistics when a live pass is stochastic). `LIVE_PACKAGE_PROJECT=/path/to/cover.artifact` adds a
manual run on a real project in both split modes.

## Plate transforms and parallax (issue #394)

Plates move as whole layers. A transform has `x` and `y` (fractions of the frame's width and height, positive right
and down), `scale` (a factor about the frame's centre), `rotation` (degrees, clockwise on screen) and `opacity` (0–1,
times the plate's alpha); neutral is `0, 0, 1, 0, 1`. Bindings drive them with two more targets:

```json
{
  "version": 1,
  "loop": { "durationSeconds": 4 },
  "bindings": [
    { "from": { "input": "pointer.x" }, "to": { "parallax": "x" }, "range": [-0.04, 0.04] },
    { "from": { "input": "pointer.y" }, "to": { "parallax": "y" }, "range": [-0.04, 0.04] },
    { "from": { "track": "wave", "phase": 0.75 }, "to": { "parallax": "scale" }, "range": [0, 0.02] },
    { "from": { "input": "hover" }, "to": { "plate": 1, "transform": "opacity" }, "range": [1, 0.6] }
  ]
}
```

- `{ "plate": n, "transform": … }` drives one plate; `n` counts the package's plates bottom up (the background is not
  one). Bindings on one plate apply in order with `set`/`add`, as for passes.
- `{ "parallax": "x" | "y" | "scale" | "rotation" }` drives every plate at once: each plate gets the binding's value
  times its `depth`, added after its own bindings (`scale` adds to the factor). One binding gives near plates more
  movement than far ones.
- `pointer.x/y` → offset, `scroll` → offset, and a wave → a subtle breathing scale. A wave with `phase: 0.75` starts
  at its trough, so mapped onto `[0, b]` it is neutral at `t = 0` and the resting frame stays the still.
- Plate and parallax targets are checked against the package's plates, with paths
  (`bindings[0].to.plate: there is no plate 2; the package has 2 (0 is the bottom)`); a chain artwork without a
  package has no plates and rejects them.

Each plate in the manifest may say:

- `depth` (≥ 0): 0 stays put, 1 takes a parallax binding's full value. The exporter writes `(index + 1) / plates` by
  stack order, so the top plate is nearest (the Вайбер cover: base plate 0.5, images and text 1); the runtime uses
  the same default when a package has none.
- `edges`: the sides of the frame the plate has pixels on, measured by the exporter on the rendered plate (`[]` for a
  plate with a transparent border). Default: all four.

**Edges: dynamic scale-to-cover, not padding.** Padding would need the editor to render each plate beyond the frame,
and layer positions, emoji scatter and effects are laid out for the frame, so a padded render would not match the
still. Instead, each frame the runtime scales a moving plate about the frame's centre by the smallest factor that keeps
its `edges` sides at or beyond the frame for the current offset and rotation (`coverScale` in `plates.ts`): `1 + 2|x|`
for a plate with pixels on every side, less when the move takes those sides outward, nothing for a plate with a
transparent border. A neutral transform needs no scaling, so the resting frame is untouched, and a breathing scale
below 1 is clamped at the cover scale. Outside a plate the shaders return transparent rather than clamping, so a
plate never smears its edge pixels.

**GPU path.** Plates no binding moves are composited exactly as before. A moving plate draws with
`TRANSFORM_OVER_FRAGMENT`, which samples the plate through the inverse transform (`uPlateMatrix`, `uPlateOffset`,
`uPlateOpacity`, computed per frame by `plateUniforms`); a moving bottom plate is placed by a first
`TRANSFORM_PLACE_FRAGMENT` step, so the chain above it runs on the moved plate. One extra draw at most, no readback.
At rest the transform is the identity and the frame is byte-identical to the still in Chromium (`runtime-plates.spec.ts`).

**Tests.** `packages/runtime/src/testing/plateCase.ts` builds a two-plate fixture package from the harness images:
the photo (every edge) under a Noise Warp chain, the graphic as a card on a transparent plate, and a magenta
background so an uncovered edge shows. `tests/browser/runtime-plates.spec.ts` checks:

- the resting frame with parallax, breathing and tilt bindings against the still package (identical);
- goldens for the pointer at the centre and each corner, and a breath at `t = 0, 0.25, 0.5, 0.75`, in
  `runtime-plates.spec.ts-snapshots/plates/` (recorded as the effect goldens are);
- no border pixel that is the background or not opaque, at every pointer corner at 8% strength, the top of a 3%
  breath and a 4° tilt, with both plates at depth 1; and, as its self-test, that the same check fails when the
  photo lists no edges.

`runtime-live-package.spec.ts` exports the sample cover with parallax bindings and checks the depths and edges it
writes and the resting frame against the editor; the `LIVE_PACKAGE_PROJECT` run also exports the project with
parallax and attaches frames at rest, in two pointer corners and at the top of a breath. The catalogue's "Plate
parallax" entry plays the fixture with strength, depth, breathing and tilt controls.

## Verification: one effect at a time

Every effect issue lands with visual tests in the shared harness (issue: parity harness):

1. **Static parity**: runtime output at rest equals the editor's `renderDocument` for the effect's fixture
   documents at 540px, within the harness tolerance. Deterministic effects compare pixels. Stochastic effects
   (seeded grain, dither, tear) compare statistics (per-channel mean and variance, histogram distance),
   because the GPU noise differs from the CPU LCG by design.
2. **Motion goldens**: frames at `t = 0, 0.25, 0.5, 0.75` for the effect's time binding, recorded in the Linux
   Playwright container used by CI.
3. **Input goldens**: frames for the pointer at centre and at a corner, and for a pointer speed sample, where the
   effect has an input binding.
4. **Budget**: the effect alone at 540px stays under 2 ms GPU time on the reference machine, checked by hand (see
   "GPU budget" below); the catalogue records the measurement.
5. **Catalogue**: the effect appears in the runtime catalogue (`/dev/runtime`) with live controls, so it can be
   judged by eye.

## Harness (issue #331)

### Adding an effect

An effect issue adds one case file and one line in `packages/runtime/test/cases/index.ts`:

```ts
// packages/runtime/test/cases/noiseWarp.ts
export default defineEffectCase({
  effect: 'noiseWarp', // registry id, also the editor preset id
  layer: { noiseWarp: 90 }, // authored values over makeEffectPresetLayer(effect)
  frames: [...MOTION_FRAMES, ...INPUT_FRAMES], // omit for a static effect
  bindings: {
    // bindings JSON (see Bindings above) for a one-pass chain: targets use pass 0
    version: 1,
    loop: { durationSeconds: 4 },
    bindings: [
      { from: { track: 'wave', cycles: 1 }, to: { pass: 0, field: 'seedOffset' }, range: [-200, 200], mode: 'add' },
      { from: { input: 'pointer.speed' }, to: { pass: 0, field: 'noiseWarp' }, range: [0, 60], mode: 'add' },
    ],
  },
});
```

Optional fields: `seed` (default 11), `fixtures` (default all three), `goldenFixture` (default `graphic`),
`bindings`, `pixelTolerance` (widens the pixel tolerance for a measured, explained rounding difference),
`parityInset` (drops that many edge pixels before static parity, for a fragment that wraps with `fract()` exactly at
the edge, as Data Mosh does). Static parity uses the authored layer alone; goldens, GPU timing and the catalogue run the case through
`createLiveArtwork` with its bindings.

From that one declaration:

- `tests/browser/runtime-harness.spec.ts` runs static parity on each fixture, the goldens, and a GPU timing. It
  fails when a registered effect has no case.
- `/dev/runtime` (development builds only) lists the effect with the editor's inspector controls for its authored
  fields, its bindings, a still/animate toggle, pointer input on the canvas, and the last measured GPU time.

Run it with `npm run test:runtime:harness -- --project=chromium` (add `--project=firefox --project=webkit` for parity
in all engines). CI runs it in `.github/workflows/runtime-experiment.yml` for pushes to and PRs into
`experiment/runtime`, with the runtime unit tests and typechecks: one job per engine in the Linux Playwright container.

- **Firefox runs headed on Xvfb.** Headless Firefox in the container has no WebGL at all: by default WebGL2 is
  blocklisted for the system, and with `webgl.force-enabled` it fails with "Exhausted GL driver options", because the
  headless widget finds no native GL. Headed under `xvfb-run` it gets WebGL2 from Mesa without any prefs, so the job
  runs `xvfb-run -a npm run test:runtime:harness -- --project=firefox --headed`.
- **A job that skipped everything fails.** The runtime specs skip when the browser has no WebGL2. With
  `PLAYWRIGHT_FAIL_ON_ALL_SKIPPED=1` (set in the workflow), `tests/browser/runtime/requireRunReporter.ts` turns a run in
  which every selected test skipped into a failure, so a browser that loses WebGL2 cannot pass green.
- **WebKit on Linux shows a lone still frame late (#404).** With the default `preserveDrawingBuffer: false`, the
  container's WebKit composites a WebGL canvas's new buffer only when the canvas presents again in a later rendering
  update. A still artwork that draws once (a control change, a pointer move) kept showing the previous frame until the
  next change; a second draw in the same frame or the next one did not help, a draw two frames later did. The catalogue
  creates its artworks with `contextAttributes: { preserveDrawingBuffer: true }`, which shows every still draw in all
  three engines. Hosts that draw stills on demand and must look right in WebKitGTK/WPE can pass the same attribute.

### Fixtures

`packages/runtime/test/fixtures`: `photo.webp` (continuous tones and grain), `graphic.png` (flat colour, hard
edges) and `text.png` (a text-heavy cover), all 540px. `generate.mjs` made them; the committed files are the source
of truth.

### Static parity

The editor side is `renderDocument` on a document with the fixture as an image layer and the effect layer above it
(stack mode, 540px). The runtime side is the resting chain for the same layer, without frame uniforms. Comparison code
and tolerances live in `packages/runtime/src/testing/parity.ts`.

| Effect | Measure | Tolerance |
| --- | --- | --- |
| Deterministic | pixels with any RGB channel off by more than 8 levels | at most 0.1% of pixels |
| Deterministic | mean absolute RGB difference | at most 0.25 levels |
| Stochastic | per-channel mean | within 1 level |
| Stochastic | per-channel standard deviation (square root of the variance) | within 0.75 levels |
| Stochastic | per-channel histogram, 32 bins, total-variation distance | at most 0.08 |

Why these numbers:

- The runtime runs the editor's own fragment, so deterministic effects should agree to rounding. Noise Warp measures
  0 pixels over 8 levels, a mean difference of 0.0001 and a worst channel of 1 level on all three fixtures in
  Chromium, Firefox and WebKit. The limits leave room for driver rounding without hiding a wrong port: swapping the
  warp axes (the spec's self-test) puts 28% of pixels over the threshold with a mean difference of 41 levels.
- Stochastic effects use GPU noise that differs from the editor's CPU noise by design, so only the distribution has
  to match. The spec's second self-test shows the split: Noise Warp with a far-off seed fails pixel parity and passes
  the statistics on the text fixture.
- The statistical limits are calibrated on Grain (#338), the first stochastic port (Grain 40, seed 11, worst channel
  per fixture; mean / std dev / histogram distance):

  | Engine | Faithful port, worst fixture | Same port, another seed |
  | --- | --- | --- |
  | Chromium, Firefox, WebKit on macOS | 0.14 / 0.06 / 0.012 | 0.14 / 0.06 / 0.012 |
  | WebKit on Linux (CI container) | 0.07 / 0.04 / 0.016 | 0.07 / 0.04 / 0.016 |
  | Chromium on Linux (CI container) | 0.34 / 0.31 / 0.067 | 0.35 / 0.31 / 0.069 |

  Chromium on Linux renders the editor's 2D canvas in software, which rounds the grain overlay with a bias: its
  editor output alone sits 0.15–0.35 levels off the other engines', and on flat colours that moves pixels across
  histogram bins. Grain changes flat colour by under a level on average, so mean and standard deviation cannot see a
  wrong strength there; only the histogram can. Broken ports, worst case across engines, on the fixture that catches
  them: half strength 0.095 (text), 0.75× 0.085 (text), no grain 0.23 (graphic), 1.5× 0.15 (graphic), opaque grain
  0.28 (graphic), normal blend instead of overlay: mean 3.3 levels. The first estimate (2, 3 and 0.05 levels) failed the
  faithful port on Linux Chromium and passed half-strength grain on the photo fixture. The limits above pass the
  faithful port in every engine and reject each broken variant on at least one fixture in every engine; the harness
  self-test checks the half-strength case. A later stochastic port that moves larger structures (glitch bands, tears)
  should record its own measurements here before widening them.
- Browsers round Canvas 2D fills differently, so a port of one can only match one engine byte for byte. Scanlines
  (#342) shows the size of it: a translucent black fill is truncated by Skia (Chromium, Firefox) and rounded by WebKit
  (Core Graphics on macOS, Cairo on Linux), and the two editors differ by 0.37 levels of mean difference on the graphic
  fixture, over the limit. The port computes both roundings and alternates them in a pixel checkerboard: at most one
  level from either editor, 0.13 / 0.18 / 0.006 levels of mean difference on photo / graphic / text in every engine.
  Matching Skia alone is exact in Chromium and Firefox and fails WebKit at 0.27 / 0.37.
- Chunk Tear allows 0.2% of pixels (one column) instead of 0.1%. Its fragment wraps with `fract(norm.x + offset)`,
  and at the last column's pixel centre `norm.x` is exactly 1 in exact arithmetic: Pixi's power-of-two filter texture
  gives exactly 1.0 in Chromium, so the editor's untorn rows wrap the left edge into the last column, while the
  runtime's texture lands just under 1.0. Every other pixel matches; on the photo fixture that column is 0.105%.

Every parity test attaches `<effect>-<fixture>-editor-runtime-diff.png` (editor | runtime | diff) to the report. In
the diff panel, red marks pixels over the threshold (brighter is larger), amber marks smaller non-zero differences,
and grey is the dimmed editor image.

### Goldens

Each frame of a case is drawn through `createLiveArtwork` with the case's bindings (pointer tracking off): its inputs
are set with `setInput`, then the artwork seeks to loop position `t` (`t × loop.durationSeconds`, or `t` seconds
without a loop), at 270px (half the parity size, to keep the PNGs
small) on the case's golden fixture. `MOTION_FRAMES` samples `t = 0, 0.25, 0.5, 0.75`. `INPUT_FRAMES` samples the
pointer at the centre, at the bottom-right corner (`pointer.x = pointer.y = 1`, measured from the top left), and a
full-speed pointer.

Goldens live in `tests/browser/runtime-harness.spec.ts-snapshots/<effect>/<frame>-chromium-linux.png`. They are
recorded for Chromium in the CI Linux container (`mcr.microsoft.com/playwright:v1.60.0-noble`, SwiftShader) and
compared with `threshold: 0.05` and `maxDiffPixelRatio: 0.002`: the same container renders the same pixels, and the
allowance only absorbs a stray rounding change. Other platforms skip the comparison. `RUNTIME_GOLDENS=1` compares
against platform-suffixed local goldens instead; do not commit those.

To record or update goldens, use either:

- **Docker**, from a copy of the checkout without `node_modules` (`npm ci` installs Linux binaries):
  `docker run --rm --platform linux/amd64 -v "$PWD":/repo -w /repo mcr.microsoft.com/playwright:v1.60.0-noble bash -c "npm ci && HOME=/root CI=1 npm run test:runtime:harness -- --project=chromium --update-snapshots"`.
  Copy the changed files under `tests/browser/runtime-harness.spec.ts-snapshots/` back, check them by eye, and
  commit.
- **CI**: when a golden is missing or differs, the `runtime-harness-chromium` artifact holds each frame's
  `*-actual.png` under `test-results/`. Rename each to its golden path above, check it by eye, and commit.

### GPU timing

`measureGpuTime` (`packages/runtime/src/gpuTiming.ts`) wraps renders in `EXT_disjoint_timer_query_webgl2` queries
and reports the median in milliseconds, or `null` when the context has no timer queries. Headless Chromium, Firefox
and WebKit report `n/a`, so in CI the spec records the value as a `gpu-time` annotation without a budget check.

### GPU budget

Each effect alone at 540px must stay at or under `GPU_BUDGET_MS` (2 ms, `packages/runtime/src/gpuTiming.ts`) of
median GPU time on the reference machine. CI cannot check it: its browsers are headless, render in software and have
no timer queries, and there is no GPU runner. The budget is enforced by hand, on real hardware, in two places:

- **Harness, before merging an effect PR.** On the reference machine (an Apple silicon Mac; the numbers below are
  from an M5 Max), run

  ```sh
  RUNTIME_GPU_BUDGET=1 npm run test:runtime:harness -- --project=chromium --headed -g "GPU time"
  ```

  Headed Chromium on macOS exposes `EXT_disjoint_timer_query_webgl2`. With `RUNTIME_GPU_BUDGET=1` every
  `GPU time at 540px` test fails when an effect is over budget, and also when there is no measurement (no timer
  queries, or a disjoint event such as a GPU switch voided every sample; rerun then), so a headless run cannot pass
  by measuring nothing. Medians move by up to 0.3 ms between runs on a busy machine, well inside the budget. Paste the logged `[runtime] <effect> GPU time` lines into the PR.
  Firefox and Safari do not expose timer queries to pages, so only Chromium is measured.
- **Catalogue, by eye.** `/dev/runtime` in desktop Chrome shows each entry's measured time and a Budget line:
  "within 2 ms" (green), "over 2 ms" (red), or "not measured" where the browser has no timer queries.

Last measured (Playwright 1.60 Chromium, headed, M5 Max, `RUNTIME_GPU_BUDGET=1`): Noise Warp 0.28 ms, Vortex 0.10 ms,
Grain 0.11 ms, Morph 0.20 ms, Chrom. Ab. 0.07 ms, Data Mosh 0.15 ms, Scanlines 0.17 ms, Tear 0.10 ms, Glitch
0.67 ms, RGB Split 0.07 ms, Ripple 0.06 ms, Barrel 0.11 ms.

## Order of work

1. Foundation: package and GPU chain → parity harness and catalogue → bindings → live-package export → embeds.
2. Effects by tier. S and A first (most visible, mostly GPU already), then B (colour, mostly transitions), then C
   (heavy texture effects; default is to bake them into plates until their port lands).

| Tier | Meaning |
| --- | --- |
| S | Strong motion or pointer value, cheap. The first demo set. |
| A | Strong, needs a port or a `uCenter` change. |
| B | Animatable, best for state changes and slow drift rather than constant motion. |
| C | Texture effects with little motion value and real porting cost; baked by default. |

## Out of scope

- 3D primitives and models (use Three.js directly on the host page).
- Shader nodes from the node graph (`render/shaderNodes.ts`); revisit after the effect set.
- Editor UI for authoring bindings; the first bindings are authored as JSON next to the package.
- Merging any of this into `development`.
