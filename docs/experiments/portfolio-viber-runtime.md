# Portfolio Viber Runtime Experiment

## Status

Passed on 2026-07-21. The portfolio owner accepted the external playback
hypothesis after verifying visible authored motion, static and reduced-motion
fallbacks, lazy loading, playback controls, and cleanup. Runtime code exists as
a packed `0.1.0-alpha.3` workspace package and the portfolio consumes that
exact tarball. The package has not been published; this document is not an
Artifact version commitment.

## Thesis

Prove that a portable Artifact project can be played outside the editor and add
meaningful authored motion to the Viber cover in the portfolio fullscreen
preview without changing the Artifact editor or CanvasDocument schema.

## Ownership

Artifact owns:

- the canonical document renderer and document normalization rules;
- the framework-independent runtime package;
- portable `.artifact` project-package parsing;
- deterministic playback inputs, lifecycle, and cleanup;
- package compatibility and prerelease publishing.

The portfolio owns:

- the checked-in Viber `.artifact` export and its static PNG fallback;
- the Viber-specific Motion Recipe;
- fullscreen controls, lazy loading, error presentation, and reduced-motion
  behavior;
- the artistic pass/fail decision.

## Non-goals

- No editor timeline, keyframes, motion inspector, or playback controls.
- No CanvasDocument schema migration.
- No automatic animation based on effect names.
- No grid animation, 3D playback, video export, or Vialyi Pirate support.
- No cloud-project fetch, authentication, or runtime dependency on Artifact
  services.
- No stable npm release or `latest` dist-tag.

## Runtime boundary

Create `packages/runtime` as a browser-safe package. Its public surface should
be no larger than the Viber consumer requires:

```ts
interface ArtifactRuntimePlayer {
  play(): void;
  pause(): void;
  seek(timeSeconds: number): void;
  resize(width: number, height: number): void;
  destroy(): void;
}

interface CreateArtifactRuntimePlayerOptions {
  canvas: HTMLCanvasElement;
  project: ArtifactProjectPackage;
  baseImageUrl: string;
  recipe: MotionRecipe;
}
```

The exact factory name may change during implementation, but the ownership may
not: the host owns the canvas and recipe; the player owns transient render
resources and its animation clock; `destroy()` releases every resource.

Motion evaluation must be deterministic for `(document, recipe, time)`, target
stable layer IDs, and derive frame input without mutating the source document.
The runtime must surface unsupported schema, unresolved asset, and renderer
errors so the host can retain its static fallback.

The first alpha implements only `raster-base-effects`. The host supplies a
finished raster plate, while the runtime reads the portable project's stable
effect-layer IDs, seed, visibility, and base values. This resolves the
metadata-only font boundary without pretending to render text, images, graph
nodes, or every effect from CanvasDocument. Unsupported recipes and document
schemas fail before the canvas replaces the static fallback.

## Technical spike

Before publishing a package:

1. Export Viber through the existing `.artifact` project-package path.
2. Verify that every animated target has a stable layer ID and that the package
   contains all image/font payloads required by a clean browser context.
3. Identify the smallest canonical renderer module boundary that can move into
   `packages/runtime` without importing editor routes, hooks, account state, or
   React components.
4. Measure repeated Viber rendering with shared image and graph caches. Decide
   whether the current stateless renderer is sufficient or a persistent render
   session is required before choosing the internal loop implementation.
5. Choose a small recipe using existing editable effect properties. Do not add
   generic time uniforms until the Viber recipe proves that current effect
   parameters cannot produce the intended loop.

### Milestone 1 findings

Recorded on 2026-07-21 against Artifact `0.41.2` at commit
`778efce9ce80f3eff8070ab8c694ecba54329179`:

- the retained package is manifest v1, document schema v3, 2,908,243 bytes,
  with 15 stable layers, two embedded PNG payloads, and no model or environment
  assets;
- the useful motion candidates already have editable numeric properties:
  Glitch, Grain, Noise Warp, Vortex, Tear, Scanlines, and Chromatic Aberration;
- a live editor probe changed Grain and produced a first visibly different
  frame after approximately 119 ms. The full-quality frame returned after the
  editor's deferred idle pass, approximately 1.2 seconds later;
- repeated Grain values returned repeatable cropped-frame hashes after the
  initial stale frame, and restoring Grain to 100 restored the original
  settled hash;
- the default license-aware package embeds both image payloads but records the
  imported font as metadata only.

The probe supports renderer determinism and nonblank sequential output. It also
rejects the simplest internal implementation: repeatedly calling the complete
editor render path on every `requestAnimationFrame` is not a viable 60 fps
player. The next spike must compare a persistent render session with a cached
static graph prefix and bounded effect resolution.

Typography parity is a separate gate. Before the external consumer smoke, pick
one explicit boundary:

1. embed the font file only after its redistribution rights are confirmed;
2. replace it with a checked-in compatible webfont; or
3. keep typography and other static upper layers in a rasterized host-owned
   plate while the runtime renders only the animated subcomposition.

Do not describe the retained license-aware package as self-contained until this
gate is resolved.

### Milestone 2 implementation

Recorded on 2026-07-21 in a worktree based on Artifact
`778efce9ce80f3eff8070ab8c694ecba54329179`:

- `packages/runtime` builds ESM plus declarations with no runtime dependencies;
- the package parser accepts portable project manifest v1/document schema v3
  and rejects unsupported schemas;
- recipes target stable IDs and animate Grain, Scanlines, Scanline Width,
  Glitch, Chromatic Aberration, and Seed Offset without mutating the source
  project;
- Artifact web imports Grain, Scanlines, Glitch, and Chromatic Aberration from the package's `rendering`
  export, so the editor and external runtime use one implementation;
- unit coverage verifies deterministic interpolation, loop endpoints, stable
  target validation, schema rejection, and source immutability;
- the packed tarball is 9,423 bytes (39.1 kB unpacked), SHA-256
  `ce6112ec4e9244bd5c38ff05373b89c9f840f6ace170d53289f4a531fbfc2a0e`;
- the packed package rendered a nonblank 512 by 512 Viber canvas through the
  portfolio consumer, with play, pause, reduced-motion fallback, and
  destroy-on-close verified in a real browser.

The earlier `0.1.0-alpha.2` Grain and Scanlines recipe passed playback and
lifecycle checks but was visually indistinguishable at normal viewing speed.
`0.1.0-alpha.3` adds Chromatic Aberration drift and short Glitch impulses as a
deliberate visibility correction.

This milestone validates the package and lifecycle boundary. The accepted
experiment deliberately does not validate full-document playback. Sustained
frame distributions, repeated ten-cycle cleanup, and packed-consumer testing
remain publication gates rather than blockers for retaining the prototype.

### Accepted follow-up

The next renderer thesis is that a host can pass a portable `.artifact` file
to Artifact Runtime and render the real document layers without a host-owned
flattened raster plate. Keep that work separate from this accepted experiment:
it must define supported layer kinds, asset and font resolution, graph order,
unsupported-node behavior, and performance budgets before implementation.

The bounded contract and first implementation spike are tracked in
[`full-document-runtime.md`](./full-document-runtime.md).

Do not publish the alpha merely because the first cover works. Keep the packed
`0.1.0-alpha.3` consumer until a second real cover tests whether the current
API is reusable; then decide whether to publish, revise, or replace it with the
full-document contract.

## Package and compatibility

- Package: `@shchilkin/artifact-runtime`.
- Current prototype version: `0.1.0-alpha.3`.
- Registry: npmjs.
- Dist-tag: `experimental`.
- Consumer dependency: exact version, no caret or tilde.
- Published build: ESM, browser-safe, with declarations and no dependency on
  private `@artifact/*` workspaces at install time.
- Compatibility: validate document schema explicitly; do not couple playback
  to the Artifact product version string.

The package must pass a packed-consumer smoke test before publication: build a
tarball with `npm pack`, install that tarball in a temporary external fixture,
load a portable project, render a nonblank frame, and destroy the player.

## Verification

Artifact-side tests must prove:

- package parsing and schema rejection;
- deterministic recipe evaluation at fixed timestamps;
- source-document immutability;
- equivalent loop endpoints within the renderer's pixel tolerance;
- play, pause, seek, resize, and idempotent destroy;
- no retained animation frame, listener, canvas resource, or GPU resource after
  repeated destruction;
- a nonblank Viber frame in a real browser.

Performance validation compares the feature branch with its base over multiple
runs. The initial target is at least 30 fps on the agreed mobile viewport and
approximately 60 fps on desktop, with no repeated long tasks over 100 ms during
steady playback.

## Delivery sequence

1. Land the package boundary, portable Viber fixture, deterministic recipe
   evaluator, and focused tests without publishing.
2. Validate Viber playback locally from a packed tarball.
3. Integrate the exact packed prerelease in the portfolio fullscreen preview.
4. Run the portfolio visual, accessibility, lifecycle, and bundle gates.
5. Record the explicit decision to retain or remove the experiment.
6. Validate the API with a second real cover and complete the performance,
   repeated-cleanup, and packed-consumer gates before publication.

## Evidence handoff

At each milestone, provide the portfolio evidence log with the Artifact commit
SHA, runtime package version or tarball checksum, document/package schema,
portable asset inventory, package size, packed-consumer result, renderer
measurements, and retained browser artifacts. Record failures as first-class
evidence. The portfolio must not infer current runtime behavior from this plan
or from an Artifact product version alone.

## Pass/fail gate

The external playback hypothesis passes when the portfolio grid keeps its
current initial runtime cost, the fullscreen preview never exposes a blank
state, static/reduced-motion/error fallbacks work, cleanup is bounded, and the
motion is judged meaningfully visible. That hypothesis passed on 2026-07-21.

Publishing the package remains stricter: mobile and desktop playback must meet
the agreed frame targets, repeated open/close cycles must clean up completely,
and a second real cover must validate the consumer API.

Failure leaves the existing portable project and PNG valid. The portfolio
removes the prerelease dependency and recipe; Artifact deprecates the alpha
package instead of promoting it.
