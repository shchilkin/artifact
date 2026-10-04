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
  `destroy`, and a `state` snapshot (`status`, `time`, `frames`, `width`, `height`). It draws one resting frame on
  creation; reduced motion keeps that still frame and never requests animation frames. Defaults: DPR cap 2,
  `maxRenderSize` 1080. Until the live package exists, `createArtwork` takes the resolved `chain` instead of
  `livePackage`.
- `effectRegistry.pass(id, layer, { seed, width, height })` → a `ChainPass` (`id`, `fragment`, `uniforms`) from an
  authored `EffectLayer`, or `null` when the effect's amount is zero. Each `EffectDefinition` declares `id`,
  `fragment`, `amount`, `uniforms`, `centered` (reads `uCenter`, default `0.5, 0.5`) and `stochastic`.
- Seam for bindings (#332): `frameUniforms({ time, frame, inputs })` returns per-pass uniform overrides each frame;
  `setInput` fills `inputs`.

Shader reuse: shared fragments live in `@artifact/shared/effect-shaders` (`HEADER`, `NORM_UV`, `SAMPLE`,
`NOISE_FRAG`, `VORTEX_FRAG`). `apps/web/app/utils/pixiFilters.ts` and the runtime both import them, so the strings stay
byte-identical. Port further editor fragments the same way: move the string, import it in both places.

Pixi conventions the chain matches:

- Textures are uploaded unflipped and premultiplied, so `vTextureCoord.y = 0` is the top of the image; only the final
  pass to the canvas flips. `UNPACK_FLIP_Y` would mirror every effect vertically against the editor.
- `inputClamp` is the input's extent inset by half a texel, as Pixi sets it. With `(0, 0, 1, 1)`, about 1% of a 540px
  Noise Warp (hard edges) differs from the editor by more than 8 levels; with the inset the outputs match.

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

## Verification: one effect at a time

Every effect issue lands with visual tests in the shared harness (issue: parity harness):

1. **Static parity**: runtime output at rest equals the editor's `renderDocument` for the effect's fixture
   documents at 540px, within the harness tolerance. Deterministic effects compare pixels. Stochastic effects
   (seeded grain, glitch, dither, tear) compare statistics (per-channel mean and variance, histogram distance),
   because the GPU noise differs from the CPU LCG by design.
2. **Motion goldens**: frames at `t = 0, 0.25, 0.5, 0.75` for the effect's time binding, recorded in the Linux
   Playwright container used by CI.
3. **Input goldens**: frames for the pointer at centre and at a corner, and for a pointer speed sample, where the
   effect has an input binding.
4. **Budget**: the effect alone at 540px stays under 2 ms GPU time on the reference machine; the catalogue records
   the measurement.
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
`bindings`. Static parity uses the authored layer alone; goldens, GPU timing and the catalogue run the case through
`createLiveArtwork` with its bindings.

From that one declaration:

- `tests/browser/runtime-harness.spec.ts` runs static parity on each fixture, the goldens, and a GPU timing. It
  fails when a registered effect has no case.
- `/dev/runtime` (development builds only) lists the effect with the editor's inspector controls for its authored
  fields, its bindings, a still/animate toggle, pointer input on the canvas, and the last measured GPU time.

Run it with `npm run test:runtime:harness -- --project=chromium` (add `--project=firefox --project=webkit` for parity
in all engines). CI runs it in `.github/workflows/runtime-experiment.yml` for pushes to and PRs into
`experiment/runtime`, with the runtime unit tests and typechecks.

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
| Stochastic | per-channel mean | within 2 levels |
| Stochastic | per-channel standard deviation (square root of the variance) | within 3 levels |
| Stochastic | per-channel histogram, 32 bins, total-variation distance | at most 0.05 |

Why these numbers:

- The runtime runs the editor's own fragment, so deterministic effects should agree to rounding. Noise Warp measures
  0 pixels over 8 levels, a mean difference of 0.0001 and a worst channel of 1 level on all three fixtures in
  Chromium, Firefox and WebKit. The limits leave room for driver rounding without hiding a wrong port: swapping the
  warp axes (the spec's self-test) puts 28% of pixels over the threshold with a mean difference of 41 levels.
- Stochastic effects use GPU noise that differs from the editor's CPU noise by design, so only the distribution has
  to match. The spec's second self-test shows the split: Noise Warp with a far-off seed fails pixel parity and passes
  the statistics on the text fixture. The statistical limits are a first estimate; the first stochastic port should
  confirm them against its own measurements and record any change here.

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
and WebKit report `n/a`, so the spec records the value as a `gpu-time` annotation without a budget check. The
catalogue shows the last measurement on the machine it runs on, which is where the 2 ms budget is judged.

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
