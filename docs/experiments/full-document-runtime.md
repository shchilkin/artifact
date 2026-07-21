# Full-document Artifact Runtime

## Status

Implementation spike. This work is separate from the accepted
`raster-base-effects` portfolio experiment and does not change the Artifact
editor schema or product release version. The new public API starts on the
independent runtime line `0.2.0-alpha.2`; the accepted portfolio experiment
remains pinned to `0.1.0-alpha.3` until full-document parity passes.

## Thesis

A browser host can pass a portable `.artifact` project package to Artifact
Runtime and render real document layers without supplying a flattened raster
plate. Unsupported documents must fail before replacing the host fallback and
must explain every blocking layer, graph node, asset, and font.

## First vertical slice

The first alpha is intentionally strict:

- portable project manifest v1 and document schema v3;
- plain layer stacks or one complete linear graph ending at `__export__`;
- fill, image, emoji, and text layers;
- Grain, Scanlines, Glitch, Chromatic Aberration, Noise Warp, Vortex, and Tear
  effect layers;
- embedded data-URL images or browser-loadable image URLs;
- host-provided CSS family mappings for `artifact-font://` references;
- one caller-owned `HTMLCanvasElement` and caller-selected pixel dimensions.

It does not support merge, repeat, color, mask, transform, material, 3D,
environment, or shader nodes. It also rejects effect presets outside those
listed above. There is no partial-render mode: rendering an incomplete design
as if it were correct would be worse than keeping the static fallback.

## Public boundary

```ts
const report = analyzeArtifactRuntimeProject(project, {
  fontFamilies: {
    'artifact-font://project-font-id': '"Checked In Project Font", monospace',
  },
});

if (report.supported) {
  await renderArtifactRuntimeProject({
    canvas,
    project,
    width: 1080,
    height: 1080,
    fontFamilies,
  });
}
```

`analyzeArtifactRuntimeProject` is side-effect free. Its capability report is
suitable for fallback decisions and diagnostics. `renderArtifactRuntimeProject`
is strict and throws `ArtifactRuntimeUnsupportedError` with the same report if
the document cannot be rendered faithfully.

Rendering is transactional in a browser context: assets are decoded first,
the document is drawn to a temporary canvas, and the caller-owned canvas is
replaced only after the complete render succeeds. A failed asset or draw keeps
the previous host frame intact.

Capability analysis describes document support and does not probe browser GPU
availability. A supported document containing a GPU effect still requires
WebGL at render time; if it is unavailable, rendering fails before the host
canvas is committed.

The host owns the canvas, selected dimensions, fallback UI, and redistribution
rights for supplied fonts. The runtime owns package validation, graph order,
image decoding, deterministic seeds, drawing, and errors.

## Canonical renderer boundary

The supported static renderer uses the same public `rendering` module already
consumed by the Artifact web app for shared texture effects. Fill drawing is
also shared in this slice, as are the canonical stack background and text
layout and drawing. Emoji and image
primitives currently mirror the editor implementation and must move fully
behind the shared module before a publishable full-document release. Until
that extraction and parity test are complete, this is an implementation spike
rather than a replacement for the editor's canonical `renderDocument` path.

## Retained Viber package

The retained Viber package is a useful adversarial fixture rather than a
hand-picked happy path:

- one linear 15-layer graph;
- fill, emoji, two embedded PNGs, four text layers, and seven effect layers;
- no utility, 3D, model, environment, or shader nodes;
- one metadata-only `artifact-font://` reference used by all text layers.

The runtime can now resolve its graph, images, basic layers, and all seven
effects. The three GPU effects use the same Pixi filters, shader source,
uniform scaling, and seed contract as the editor. The package remains blocked
only by four text layers sharing one unresolved font reference.

The retained font is metadata-only and its redistribution rights are not
established. It is deliberately not bundled with the runtime. The portfolio
host must load a licensed project font or a deliberate replacement, then map
the package reference through `fontFamilies`. That mapping resolves all four
text layers without changing the Artifact document.

## Acceptance gates

Before replacing the portfolio's host raster plate:

1. Share the remaining image and emoji primitives with the editor renderer and
   add pixel-parity fixtures for fill, image, emoji, and text.
2. Resolve the Viber font through a redistribution-safe checked-in font or an
   explicit host replacement and record that decision.
3. Render the retained Viber package in a clean browser with zero capability
   issues and compare it to the accepted static cover.
4. Measure first render, repeated render, and ten create/destroy cycles before
   combining full-document rendering with motion playback.

Animation remains a later step. Static real-layer parity is the gate that
proves the portfolio actually understands the Artifact file.
