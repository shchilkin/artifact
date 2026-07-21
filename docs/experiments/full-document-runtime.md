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
const report = analyzeArtifactRuntimeProject(project, { fontFamilies });

if (report.status === 'ready') {
  await renderArtifactRuntimeProject({
    canvas,
    project,
    width: 1080,
    height: 1080,
    fontFamilies,
  });
} else if (report.status === 'unresolved-fonts') {
  // Keep the document snapshot declared by the host presentation contract.
  console.info(report.unresolvedFonts);
}
```

`analyzeArtifactRuntimeProject` is side-effect free. Its capability report is
suitable for fallback decisions and diagnostics. `renderArtifactRuntimeProject`
is strict and throws `ArtifactRuntimeUnsupportedError` with the same report if
the document cannot be rendered faithfully.

The additive `status` result distinguishes three host decisions:

- `ready` means every layer can be rendered with the supplied inputs;
- `unresolved-fonts` means fonts are the only blockers, with one aggregated
  `{ ref, layerIds }` entry per missing font in `unresolvedFonts`;
- `unsupported` means another layer, graph, asset, or effect blocker remains.

`supported` remains available for existing consumers and is true only for
`ready`. The runtime does not parse a portfolio-specific presentation manifest
or choose its raster URL. A host may use `unresolved-fonts` to retain the
checksummed document snapshot declared beside the portable project without
changing the `.artifact` package or losing its editable text/font metadata.

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
established. It is deliberately not bundled with the runtime. Without a host
mapping the report is `unresolved-fonts`, aggregates the four text layer IDs
under the single `artifact-font://` reference, and leaves the caller canvas
untouched. A licensed font or deliberate replacement may still be mapped
through `fontFamilies`; that changes the report to `ready` without changing the
Artifact document.

The portfolio contract remains external and unchanged. At portfolio commit
`ff49bee`, `viber.runtime.json` declares the portable project, a checksummed
1024 by 1024 PNG `document-snapshot`, and the VCR OSD Mono [RUS by Daymarius]
font as `metadata-only`, `unverified`, with `document-snapshot` fallback. The
runtime result is compatible with that shape but does not own or duplicate it.

## Viber implementation evidence

The retained 15-layer package was exercised in Chromium outside the editor
with an explicit temporary host font mapping:

- graph analysis returned the saved 15-layer order and zero capability issues;
- the full document rendered nonblank at 512 by 512;
- repeated renders produced the same checksum;
- the Noise Warp, Vortex, and Tear GPU pass changed 17,517 pixels;
- removing the host mapping produced `unresolved-fonts` for one font reference
used by four text layers, so the host can keep its declared snapshot.

The retained input used for the repeatable 256 by 256 smoke has SHA-256
`720f4094feb258227346a02cbf20a4787ff120f7aaf450c64f06684686c643b8`.
Headless Chromium 148.0.7778.96 produced checksum `117412325` twice, with
65,536 nontransparent pixels; the first render took 1,195.2 ms and the warm
repeat 42.8 ms on the recorded local machine. Timing is diagnostic rather than
a cross-machine performance budget.

This evidence validates the narrow Viber slice. It does not establish font
redistribution rights, publishability, or parity for unsupported layer/node
kinds.

The smoke is reproducible against the exact retained package while the local
web development server is running:

```bash
ARTIFACT_VIBER_PROJECT=/absolute/path/to/viber.artifact \
  ARTIFACT_VIBER_SCREENSHOT=/private/tmp/viber-runtime-smoke.png \
  npm run verify:runtime-viber
```

The command records the input SHA-256, browser user agent, layer order and
capability reports, first/repeated checksums and timings, nontransparent pixel
count, GPU-changed pixel count, and an optional screenshot. The package itself
is supplied by path so this repository does not copy or redefine the portfolio
contract.

## Acceptance gates

Before replacing the portfolio's host raster plate:

1. Share the remaining image and emoji primitives with the editor renderer and
   add pixel-parity fixtures for fill, image, emoji, and text.
2. Keep the declared raster document snapshot for the current unverified font,
   or separately approve a redistribution-safe font/replacement before live
   text rendering.
3. Render the retained Viber package in a clean browser with zero capability
   issues and compare it to the accepted static cover.
4. Measure first render, repeated render, and ten create/destroy cycles before
   combining full-document rendering with motion playback.

Animation remains a later step. Static real-layer parity is the gate that
proves the portfolio actually understands the Artifact file.
