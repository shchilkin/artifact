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
`NOISE_FRAG`). `apps/web/app/utils/pixiFilters.ts` and the runtime both import them, so the strings stay
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
