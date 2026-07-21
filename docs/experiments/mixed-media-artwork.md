# Mixed Media Artwork

## Status

Product and runtime direction following the accepted Viber playback experiment.
This document records the thesis and transitional authoring model. It does not
commit the Artifact editor to animation UI or a durable document schema.

## Thesis

Artifact work should not have to become one flat image when it leaves the
editor. A layered Artifact Composition can remain live as Mixed Media Artwork:
static media and procedural layers are rendered together, and selected layer
properties may change over time.

Motion is sufficient for the first useful result. Viewer input is optional and
may add interactivity later.

Artifact is not limited to covers. A Composition may represent a cover, poster,
scene, visual, or another kind of artwork. Interactive Cover is therefore a
portfolio use case, not the name or scope of the runtime model.

## Resolved model

- Artifact Composition is the layered visual source authored in Artifact.
- Mixed Media Artwork is its live presentation outside the editor.
- Motion Recipe is Artwork-owned choreography targeting stable layer IDs.
- Motion Recipes target typed Motion Controls declared by the Runtime Profile.
  A control may map to an authored property or deterministic procedural
  behavior such as emoji-field phase without mutating the Composition.
- Motion Controls use semantic namespaces such as `transform.*`, `emoji.*`, and
  `effect.*` instead of exposing abbreviated CanvasDocument property names.
- Motion Controls modulate the authored Composition baseline through relative
  offsets, rotations, multipliers, or procedural phase. The first profile does
  not use recipes as a second source of absolute layer values.
- Recipe compatibility is validated through profile, stable layer ID, expected
  layer kind, and Motion Control support. A Composition checksum is retained as
  provenance and study evidence but does not block ordinary compatible edits.
- The first profile provides three deterministic Motion Sources: keyframes for
  authored events, oscillators for periodic movement, and seeded noise for
  organic variation. Arbitrary expressions and unseeded randomness are outside
  the profile.
- A Motion Recipe declares its duration and either `loop` or `once` with a held
  final state. Viber and `Sochnaya i vlazhnaya` use loops, while the Runtime
  Profile remains suitable for finite non-cover choreography.
- Every Recipe starts at the Neutral Frame, where relative offsets and rotations
  are zero, multipliers are one, and procedural phase is neutral. Loops return
  to the same frame. Static fallback and reduced-motion presentation therefore
  remain visually continuous with the authored Composition.
- Presentation Policy belongs to the host and controls autoplay, pause, reduced
  motion, visibility, and quality without redefining choreography.
- Interactive Artwork is Mixed Media Artwork that additionally responds to
  viewer input or host state.
- Artwork Parameters are the meaningful values the Artwork may respond to,
  rather than raw browser or device events.
- Interaction Bindings belong to the host and translate pointer, scroll, audio,
  camera, or other application input into Artwork Parameters.
- The first Mixed Media milestone implements time-based motion only. Artwork
  Parameters remain part of the model but are not a delivery requirement until
  document-backed motion is proven.
- Runtime follows faithful-or-fallback behavior. It must not silently skip,
  flatten, or replace unsupported authored layers. An author may deliberately
  create another Composition, but Runtime must not disguise that derivative as
  faithful rendering of the original.
- Runtime support is expressed through named, versioned capability profiles.
  The first profile is mixed-media 2D and explicitly excludes 3D models,
  environments, and 3D scene behavior.

## Transitional authoring

Artifact does not currently provide animation or choreography authoring. The
first implementation therefore keeps motion beside the Composition as an
Artwork-owned sidecar:

```text
viber.artifact
viber.motion.json
```

The sidecar is versioned with the Composition, targets stable layer IDs, and is
executed by Artifact Runtime. It may be tuned manually with live preview while
the hypothesis is experimental. Its storage outside the editor does not make
the host application the owner of the choreography.

A development-only Motion Lab provides the temporary authoring surface. It can
load a Composition and sidecar, preview and scrub motion, inspect capabilities
and performance, tune declared controls, and export the sidecar. It does not
edit the Composition or become an Artifact timeline editor.

Motion Lab work stays on a dedicated `experiment/artifact-motion-lab` branch
based on `experiment/artifact-layer-runtime`. It is developed and reviewed
separately from Artifact product releases and is not merged into `development`
merely because the runtime experiment succeeds.

The milestone includes a local hands-on review in Motion Lab. Deterministic
tests establish correctness; the review decides whether the choreography is
visibly expressive without overwhelming the original artwork.

## Portfolio presentation policy

The album grid remains static. It does not preload Runtime, portable
Compositions, or Motion Recipes for every cover. Mixed Media Artwork starts only
after the visitor opens a fullscreen preview.

The existing static cover remains visible while Runtime and Artwork assets load.
The live canvas replaces it only after a complete first frame is ready. Closing
the preview destroys the render session. Reduced-motion presentation remains on
the static cover and does not initialize Runtime.

Choreography uses a continuous clock evaluated independently from render
cadence. Runtime schedules through the host frame loop, while Presentation
Policy may set a maximum frame rate. A Motion Source may explicitly request
stepped evaluation when that rhythm is part of the Artwork; incidental dropped
frames are not treated as choreography.

The first public target is stable 30 fps at a maximum 512 by 512 render size.
Desktop 60 fps is measured as a desired result rather than required before the
first public proof.

If Mixed Media Artwork proves useful across real works, Artifact may later
import, author, and export the same concept. That is a separate product decision
and must not block runtime validation.

## Target runtime interface

The package remains `@shchilkin/artifact-runtime`. Its target factory creates
Mixed Media Artwork rather than exposing a cover-specific or player-specific
model:

```ts
const artwork = await createMixedMediaArtwork({
  canvas,
  composition,
  motionRecipe,
  profile: 'mixed-media-2d@1',
});
```

The returned `MixedMediaArtworkSession` owns the active render lifecycle and
provides `start`, `pause`, `seek`, `resize`, and `destroy`. Session is a
technical lifecycle term; Mixed Media Artwork is the domain result.

## Evidence sequence

The portfolio experiment should be described as three increasingly strong
claims:

1. The raster prototype proved external package delivery, deterministic motion,
   lifecycle, fallbacks, and visibly authored effect changes.
2. Full-document rendering proved that Runtime can interpret and reconstruct a
   real portable Artifact Composition.
3. Document-backed motion must prove that selected real layers remain live and
   animated without using a flattened image as the rendered source.

Only the third claim establishes the Mixed Media Artwork thesis.

## Validation artworks

Viber is the first conformance fixture. Its 15-layer Composition is already
inside the current static 2D renderer profile except for one metadata-only font.
A local, explicitly supplied font mapping may be used to validate document-backed
motion, but that does not make the font redistributable or the result ready for
public full-document playback.

Its first choreography must combine three distinct forms of evidence: spatial
motion of one real image layer, modulation of authored procedural effect layers,
and deterministic motion inside the emoji layer. Typography and the Parental
Advisory layer remain stable anchors. Procedural-only post-effects are
insufficient because the result could still be mistaken for filtering a flat
image.

`Sochnaya i vlazhnaya` is the second, public proof. Its retained Composition has
no font dependency, but its 17 layers exercise a broader set of 2D effects. It
must render faithfully before the portfolio replaces its flattened source.

The sequence is deliberate: Viber validates the persistent document and motion
architecture with fewer renderer variables; `Sochnaya i vlazhnaya` then expands
the 2D profile and validates the public Mixed Media Artwork claim.

## Non-goals

- No animation timeline or choreography editor in Artifact yet.
- No new cover-specific document type.
- No requirement for viewer interaction in the first implementation.
- No arbitrary host JavaScript mutating document layers.
- No hidden flattening or omission of unsupported Composition content.
- No stable package release based on one artwork.

## Open decisions

- How time-based choreography and Artwork Parameters combine when they target
  the same layer property.
- The exact `Sochnaya i vlazhnaya` capability inventory required to extend the
  first 2D profile into the public proof.
- What evidence is sufficient before motion authoring belongs in the Artifact
  product roadmap.

The confirmed implementation contract and separate-chat handoff are recorded
in [`mixed-media-runtime-v1.md`](./mixed-media-runtime-v1.md).
