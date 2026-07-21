# Mixed Media Runtime v1 implementation handoff

Implementation evidence for the accepted vertical slice is recorded in
[`mixed-media-runtime-v1-status.md`](./mixed-media-runtime-v1-status.md). This
document remains the product and domain contract.

## Status

Confirmed implementation contract from the Mixed Media Artwork grilling session
on 2026-07-22. Build this as an isolated experiment. Do not merge it into
Artifact `development`, publish a package, or change the product editor merely
because the local validation passes.

## Working branch

Create `experiment/artifact-motion-lab` from
`experiment/artifact-layer-runtime`. Use a dedicated worktree. The dirty main
Artifact checkout is not an implementation surface.

## Objective

Prove that Artifact Runtime can create time-based Mixed Media Artwork from a
real portable Artifact Composition and Artwork-owned motion sidecar. The first
vertical slice reconstructs Viber from its real layers, animates a real image
layer, procedural effect layers, and the emoji field, and exposes the result in
a local Motion Lab.

The rendered source must be the portable Composition. A flattened cover may
remain a host fallback but must not be the source of the live frame.

## Public runtime direction

The package remains `@shchilkin/artifact-runtime`. Replace the player-specific
target interface with the Mixed Media Artwork model:

```ts
const artwork = await createMixedMediaArtwork({
  canvas,
  composition,
  motionRecipe,
  profile: 'mixed-media-2d@1',
});

interface MixedMediaArtworkSession {
  readonly currentTime: number;
  readonly isRunning: boolean;
  start(): void;
  pause(): void;
  seek(timeSeconds: number): void;
  resize(width: number, height: number): void;
  destroy(): void;
}
```

Exact TypeScript names may be sharpened during implementation only when the
domain meanings stay intact. Keep the accepted raster prototype available until
the portfolio has migrated; do not silently change its behavior.

## Motion sidecar

The experiment uses an Artwork-owned, versioned `.motion.json` file beside the
portable Composition. It is not a CanvasDocument migration and is not owned by
the portfolio host.

The schema must declare:

- recipe kind and schema version;
- Runtime Profile `mixed-media-2d@1`;
- diagnostic Composition SHA-256 provenance;
- timeline duration and `loop` or `once` temporal mode;
- stable track IDs;
- target layer ID, expected layer kind, and semantic Motion Control;
- one deterministic Motion Source and relative output range per track;
- optional deliberate source quantization through `stepFps`.

Compatibility is semantic. Runtime validates profile, layer identity, layer
kind, and Motion Control support. Composition SHA is reported but does not make
ordinary compatible edits fail.

## Motion sources

The first profile supports only:

1. Keyframes for authored events and impulses.
2. Oscillator for periodic movement.
3. Seeded Noise for deterministic organic variation.

No arbitrary expressions, callbacks, unseeded randomness, DOM events, or host
JavaScript may execute as choreography. Equal Composition, Recipe, and time must
produce equal evaluated controls and equal pixels within the renderer tolerance.

Choreography time is continuous. Render cadence is independent Presentation
Policy. A host may cap frames; `stepFps` is used only when quantization is an
authored visual decision.

## Motion controls

Controls are namespaced, profile-defined, and relative to the authored layer
baseline. Implement the smallest Viber set:

- `transform.translateX`
- `transform.translateY`
- `transform.rotate`
- `transform.scale`
- `transform.opacity`
- `emoji.phase`
- `emoji.drift`
- semantic intensity controls for the retained Grain, Glitch, Noise Warp,
  Vortex, Tear, Scanlines, and Chromatic Aberration effect layers

Do not expose abbreviated CanvasDocument fields such as `ca` as public controls.
Translate semantic controls to canonical renderer inputs inside the Runtime
Profile.

Translation and rotation are additive, scale and opacity are multiplicative,
effect intensity modulates the authored amount, and emoji controls drive a
deterministic field derived from the authored seed. Motion evaluation must not
mutate the source Composition.

## Neutral frame

At `t = 0`, every control is neutral:

- translation and rotation offsets are zero;
- scale, opacity, and effect multipliers are one;
- procedural phase and drift are neutral.

A loop returns to the same state at its duration boundary. Static fallback,
reduced-motion presentation, and the first complete Runtime frame therefore
remain continuous with the authored Composition.

## Runtime profile

`mixed-media-2d@1` is capability-based and faithful-or-fallback. It supports the
2D layer, graph, effect, asset, and font behavior needed by the retained Viber
fixture. It does not promise support for 3D models, environments, 3D scenes,
unsupported graph shapes, or every Artifact effect.

Capability analysis must reject unsupported content before replacing a host
frame. Runtime must not silently omit, flatten, replace, or downgrade authored
content.

## Render session

Create one persistent document-backed session per opened Artwork:

- parse and analyze once;
- resolve graph order once;
- decode images and resolve host-provided fonts once;
- compile and validate the Motion Recipe once;
- preserve immutable authored layer baselines;
- cache reusable static render work where parity permits;
- evaluate relative controls at requested time;
- commit a complete frame transactionally;
- release animation, canvas, image, listener, and GPU resources on destroy.

Do not call the complete stateless editor render path on every animation frame.
Keep canonical renderer semantics and add parity fixtures before moving or
duplicating more layer implementations.

## Viber choreography

Use the retained 15-layer Viber package and an explicit local font mapping. Do
not commit or redistribute the unverified font.

The first choreography must include:

- subtle translation or rotation of image layer
  `layer-1780509986923-502`;
- deterministic phase or drift inside emoji layer
  `layer-1780509501549-384` without reshuffling the whole field each frame;
- slow modulation of one or more authored procedural effect layers;
- rare, controlled Glitch or Tear impulses;
- stable typography and Parental Advisory as visual anchors.

The artistic target is visibly alive at normal viewing size without making the
original cover continuously shake or read as a flat post-processing filter.

## Motion Lab

Add a development-only local harness. It must:

- load a portable `.artifact` file and `.motion.json` sidecar;
- show capability and compatibility diagnostics;
- render the Neutral Frame before motion starts;
- start, pause, seek, and scrub deterministic time;
- select a layer and inspect its supported Motion Controls;
- tune declared source and range values with immediate preview;
- show frame cadence, render duration, long tasks, render size, and active
  Runtime Profile;
- export an updated sidecar without editing the Composition;
- provide a local URL for the owner review.

Keep Motion Lab outside the Artifact product editor. It is temporary experiment
tooling, not a timeline or general layer editor.

## Verification gates

Automated verification must cover:

- sidecar schema and profile validation;
- missing layer, wrong layer kind, and unsupported control rejection;
- deterministic Keyframes, Oscillator, and Seeded Noise evaluation;
- source Composition immutability;
- Neutral Frame and loop-end equality;
- static full-document parity at the Neutral Frame;
- localized pixel change from real image-layer motion;
- deterministic emoji motion without frame-to-frame random reshuffling;
- transactional failure that leaves the previous host frame intact;
- idempotent destroy and ten create/start/destroy cycles;
- a packed external-consumer smoke when the vertical slice is accepted.

Measure the local Viber slice at maximum 512 by 512. The first target is stable
30 fps after warmup with no repeated long tasks over 100 ms. Measure 60 fps on
desktop as a desired result, not a first-proof blocker. Record first-frame time,
warm-frame distribution, package size, browser identity, and input SHA.

## Owner review gate

Run Motion Lab locally and let the owner tune and judge the Viber choreography.
Passing tests does not establish artistic success. Record whether image motion,
emoji motion, and procedural modulation are individually visible and whether
the combined result preserves the cover hierarchy.

## Portfolio handoff

Do not edit the portfolio in this task. On acceptance, provide:

- Artifact commit SHA and branch;
- packed package version and SHA-256;
- recipe schema and Runtime Profile versions;
- Viber Composition and recipe SHA-256 values;
- capability report and supported control inventory;
- local Motion Lab URL and screenshots;
- deterministic frame checksums;
- first/warm frame measurements and lifecycle evidence;
- explicit remaining blockers, especially font redistribution.

The portfolio task will keep the album grid static, dynamically load Runtime and
Artwork only in fullscreen, retain the static cover until a complete live frame
is ready, and skip Runtime for reduced motion.

## Next public proof

After Viber conformance, inventory the retained 17-layer `Sochnaya i vlazhnaya`
Composition. Expand `mixed-media-2d` only through canonical renderer parity and
faithful capability support. Its lack of a font dependency makes it the first
candidate for public document-backed Mixed Media Artwork.
