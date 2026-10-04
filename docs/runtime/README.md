# Artifact Runtime (experimental)

Status: experiment. Lives on `experiment/runtime`; never merged into `development` or shipped in product
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
