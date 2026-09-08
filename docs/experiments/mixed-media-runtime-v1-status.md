# Mixed Media Runtime v1 implementation status

Status: implemented and locally verified on `experiment/artifact-motion-lab`.
The September standalone embed follow-up loads the owner-supplied embedded font
locally. Choreography acceptance and asset redistribution rights remain owner
review gates; font availability is no longer a local integration blocker.

This record reports implementation against the accepted
[`mixed-media-runtime-v1.md`](./mixed-media-runtime-v1.md) contract. It does not
change that contract or claim portfolio migration readiness.

## Standalone website follow-up — 2026-09-08

### Selected effect phase follow-up

The owner subsequently approved trying flowing Noise Warp, evolving Grain and
authored Glitch events, with the phone and typography held still. The bounded
control extension and its preserved compatibility rules are documented in
[`effect-phase-v1.md`](./effect-phase-v1.md). The standalone page now provides
combined/isolated effect choices and the retained previous embed variant.

Latest local evidence:

- Output directory:
  `/var/folders/v9/vx4pp4v55fng41gsp3g7bn1w0000gn/T/artifact-viber-embed-IA1HtR`.
  The session-only server at `http://127.0.0.1:4184/` now serves its `dist/`.
- Package remains unpublished `0.3.0-alpha.0`; tarball SHA-256:
  `3a1c3fcf5783aaa6532cf0e53c59ad1a54bc4889de466b38c4d7a1eb487ab58b`.
- Signal recipe SHA-256:
  `eea181b97d95ea8cd5b6570970130600f881978800ac66db7e6a186e8d0a197e`.
  Composition SHA remains unchanged. Three layers, four tracks, eight seconds.
- At 1.6 seconds: flow changes 66,520 pixels; grain 65,831; glitch 14,486;
  combined 66,533. All four modes preserve 190,171 opaque foreground-interior
  pixels exactly. A one-pixel antialias fringe is excluded, as described in the
  phase proof; the initial raw mask showed at most two one-channel/one-level
  edge differences from background compositing, not layer movement.
- Every mode has zero differences for repeated out-of-order seeks, the loop
  boundary, batched versus separate GPU passes, and the prior build's neutral
  poster. Grain holds within its authored step; Glitch is neutral between events.
- Neutral RGBA SHA-256 remains
  `661308ce7b43745da02c99c13be638986dd7bc171b4f1c14dada61a7c61cbbc5`.
- Final isolated Chrome warm sample at 512px: 60.07 fps, frame p50 10.7 ms,
  p95 25.7 ms, zero frames over 100 ms; creation 36.2 ms. An earlier batched
  sample reached 39.75 fps under different local load. These are local samples,
  not a cross-device 60 fps guarantee. Unbatched candidates missed 30 fps;
  batching and bounded chromatic sampling reuse closed that local gate.
- `verify:runtime-signal` and all eight `verify:runtime-embed` groups passed.
  Mode selection also passed CLI-driven Chrome verification. Screenshot and
  detailed per-mode checksums are in `signal-ui.png`, `signal-verification.json`
  and `verification.json` in the output directory.
- Runtime suite: 44 tests. No pointer response, editor timeline, portfolio
  migration, font redistribution, package publication or merge was added.

The initial standalone-embed record below is retained for comparison.

The earlier packed smoke proved factory imports, not an actual website render.
`examples/viber-embed` now closes that gap: a separate temporary npm consumer
installs the packed runtime, builds a plain HTML/JavaScript host and renders the
real Viber Composition in Chrome without workspace-source imports. Reproduction
commands and integration boundaries are in its README.

The newly supplied `viber.artifact` retains the same fifteen layers and adds
embedded font bytes. Its SHA-256 is
`ae7527970dc0bdeef41b7d467a68876d93993e2a1b73d8df62682beea62882ff`.
Runtime preparation now decodes those bytes into session-local FontFaces;
explicit host mappings still take precedence. Missing payloads remain
unresolved, corrupt bytes fail initialization, and destroy/failure cleanup
removes owned fonts. No font bytes or private Composition are committed or
included in the npm package.

The standalone recipe selects five tracks on four layers: phone sway/tilt,
emoji drift, grain and glitch. Its SHA-256 is
`0a9c4bef1ce6b1236b606162a5490e6234099beb6af52e256ccc272c2d30ebdf`.
The full conformance recipe and existing raster prototype are unchanged.
This is time-based motion with transport controls, not pointer-driven layers.

The host retains a static PNG while loading or on failure; dynamically loads
the runtime on opening; pauses when hidden; exposes pause and neutral-frame
controls; and releases its session on closing. Reduced motion retains the
poster without loading the runtime, Composition or recipe. The preparation
script renders that poster through the package with the embedded font. Exact
poster/neutral pixel equality therefore proves transition continuity, not an
independent comparison against an editor export.

Browser evidence, tarball SHA, input hashes and isolated install lockfile are
recorded in the generated local directory. The package remains unpublished
`0.3.0-alpha.0`; the tarball SHA distinguishes this build from the original
experiment. No portfolio files, deployment, merge or package publication are
part of this follow-up. Public hosting remains gated on asset/font rights;
the local technical proof does not confer redistribution permission.

Validated follow-up build:

- Runtime tarball SHA-256:
  `a1f46ce92d09da17f13eb74da395c317659cc89e7b0abd8517efd95d8f56dee5`.
- Runtime unit tests: 7 files, 40 tests passed. Web unit/render tests: 84 files,
  677 tests passed. Runtime/web typechecks, format check and full web/backoffice
  production build passed. Lint has no errors and retains 11 existing
  react-refresh warnings in `docs.nodes.tsx`.
- Packed Chrome verification passed eight groups: lazy initial load; embedded
  font plus exact neutral/poster equality, animation and pause; ten clean
  reopen cycles; no console errors or workspace imports; mobile reduced motion;
  asset failure fallback; corrupt font fallback; close-during-load/reopen and
  live reduced-motion cleanup.
- Desktop and 390px mobile screenshots were inspected. CLI-driven Chrome also
  opened the page and its artwork dialog without browser errors.
- Local output directory:
  `/var/folders/v9/vx4pp4v55fng41gsp3g7bn1w0000gn/T/artifact-viber-embed-h3bXNh`.
  `verification.json` records browser identity, hashes and completed checks.
- Local preview: `http://127.0.0.1:4184/`. A session-only macOS launchd job
  `dev.artifact.viber-embed` keeps this server independent of the agent terminal.
  It does not start after logout/reboot. Stop it with
  `launchctl bootout gui/$(id -u)/dev.artifact.viber-embed`; restart later using
  `serve:runtime-embed` or regenerate the temporary output if it was cleaned.

The sections below preserve the original conformance record and its original
metadata-only fixture/font blocker as historical evidence.

## Implemented slice

- `@shchilkin/artifact-runtime@0.3.0-alpha.0` retains the existing raster
  `createArtifactRuntimePlayer` API and adds the document-backed
  `createMixedMediaArtwork` session.
- The versioned Artwork-owned sidecar uses
  `artifact-motion-recipe@1` with Runtime Profile `mixed-media-2d@1`.
- Keyframes, Oscillator, and Seeded Noise are deterministic and support explicit
  stepped evaluation. Control ranges are relative to immutable Composition
  baselines.
- Supported controls are image transform and opacity, deterministic emoji phase
  and drift, and the retained Viber grain, glitch, noise warp, vortex, tear,
  scanlines, and chromatic-aberration intensities. Capability validation rejects
  missing layers, wrong layer kinds, unsupported controls, malformed sources,
  duplicate bindings, and neutral/loop violations.
- The session renders the Neutral Frame before creation resolves; supports
  start, pause, seek, resize, loop, and once/hold time; commits only complete
  offscreen frames; coalesces stale queued work; and releases animation, image,
  prefix-cache, canvas, and shared GPU resources on idempotent destroy.
- The development-only `/dev/motion-lab` route loads the retained Viber
  Composition and sidecar, exposes transport and declared-control tuning,
  reports capabilities and performance, accepts a browser-local font mapping,
  and exports a revised sidecar without mutating the Composition. The route and
  its assets are absent from the production build.

No 3D profile, arbitrary JavaScript or expression evaluation, editor timeline,
portfolio code, package publication, or development-branch integration was
added.

## Retained Viber conformance

Inputs:

- Composition SHA-256:
  `720f4094feb258227346a02cbf20a4787ff120f7aaf450c64f06684686c643b8`
- Sidecar SHA-256:
  `d1c873f8d9d2528b242a3e19065e73e911ddf173b27f80bbb8ae791a45d86a8e`
- Capability: `ready`, `linear-graph`, 15 ordered layers with an explicit local
  fallback mapping
- Compatibility: `compatible`; Composition provenance `match`

Deterministic 512 by 512 pixel evidence:

- Neutral and loop-end checksum:
  `17ed952758f04c79d9df084be6bdff0677a09b27e11321eac4225c397754e72f`
- Repeated animated-frame checksum:
  `18b366df724a64b1a036a1f61f41ff83b91e261e821586a63d86b18032cb5a42`
- Static renderer versus Neutral Frame: zero changed pixels and zero maximum
  channel delta across 262,144 pixels
- Image-motion isolation: 154,459 changed pixels
- Emoji-motion isolation: 62,619 changed pixels
- Emoji pixels within one declared 12 fps choreography step: zero changed pixels,
  proving the field is stable rather than randomly reshuffled per render
- Effect-modulation isolation: 69,143 changed pixels

Local Headless Chrome 148 measured 48.9 fps after warmup, above the required
stable 30 fps target and below the desired 60 fps result. The first complete
frame rendered in 334.3 ms; warm-frame p50 was 1.3 ms and p95 was 48.8 ms.
One 219 ms startup long task was observed and no repeated long tasks over 100 ms
occurred during the measured loop. The browser identity was HeadlessChrome
148.0.7778.96 on macOS.

The packed external-consumer smoke passed for
`@shchilkin/artifact-runtime@0.3.0-alpha.0`:

- tarball size: 39,303 bytes
- tarball SHA-256:
  `9b86e1270f85d4fb672830c4e92fe96a94f469b9d24fe8446d390dbe893db38a`
- both the retained raster factory and Mixed Media Artwork factory imported from
  the packed package

## Verification

The focused and repository gates completed with:

```bash
npm run format:check
npm run lint
npm run check
npm run typecheck:runtime
npm run typecheck
npm --workspace @shchilkin/artifact-runtime test
npm test
npm run build
npm run verify:runtime-packed-consumer
npm run verify:runtime-viber
npm run test:browser:chromium -- tests/browser/motion-lab.spec.ts
```

The runtime suite covers malformed and incompatible sidecars, deterministic
source evaluation, immutable application, Neutral Frame and loop invariants,
transactional failure, lifecycle controls, and ten create/start/destroy cycles.
The focused browser test covers the development route, complete Neutral Frame,
transport, scrubbing, tuning, sidecar export, and browser console errors.

## Remaining owner-review blockers

The retained Composition references
`artifact-font://0af0456e-d532-4438-a36a-5c4969325a31`, but the retained file
contains metadata rather than font bytes. Without a mapping, capability
validation faithfully reports `unresolved-fonts` for its four text layers. The
font is not committed, packed, exported, or redistributed by this slice.

An owner must load a legally usable local font in Motion Lab and judge whether
the image motion, emoji motion, and each procedural modulation are individually
visible while the combined loop preserves the original cover hierarchy. The
automated pixel evidence establishes correctness and localization, not artistic
acceptance. Portfolio migration remains a separate follow-up after that review.
