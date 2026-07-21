# Mixed Media Runtime v1 implementation status

Status: implemented and locally verified on `experiment/artifact-motion-lab`.
The runtime proof is ready for owner choreography review; exact Viber typography
remains blocked on an owner-supplied, redistribution-cleared local font mapping.

This record reports implementation against the accepted
[`mixed-media-runtime-v1.md`](./mixed-media-runtime-v1.md) contract. It does not
change that contract or claim portfolio migration readiness.

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
