# Effect phase experiment

Owner-approved follow-up to the Mixed Media Runtime v1 proof, 2026-09-08.
This extends the unpublished `mixed-media-2d@1` control inventory; it does not
change existing control semantics, Composition persistence, or the editor UI.

## Controls

| Control | Meaning | Neutral | Rendering |
| --- | --- | --- | --- |
| `effect.noiseWarp.phase` | Offset through the existing noise sampling domain, in noise-coordinate units | 0 | Samples move along `(phase, 0.63 * phase)`; authored seed and warp strength stay fixed |
| `effect.grain.phase` | Signed local grain pattern index | 0 | Truncates toward zero; the resulting deterministic pattern holds until the integer index changes |
| `effect.glitch.phase` | Signed local glitch pattern index | 0 | Same phase-index rule, affecting only this effect's random stream |

The existing `effect.*.intensity` controls remain multipliers with neutral 1.
Phase controls use symmetric ranges around zero and the existing Keyframes,
Oscillator or Seeded Noise sources. There is no global live time uniform,
arbitrary expression, new Motion Source, or pointer binding.

For stepped patterns, phase zero uses the original LCG stream exactly; nonzero
indices mix an integer phase into that local stream. The Composition's global
seed and layer seedOffset never change. At equal time, seek order and frame
cadence cannot alter the generated pattern. `stepFps` is explicitly authored
at 12 for grain/glitch; Noise Warp is continuous.

The profile advertises each phase only on its matching effect preset. Older
runtime builds reject unfamiliar controls rather than silently ignoring them.
Identify local tarballs by SHA-256 while the experimental package version stays
`0.3.0-alpha.0`. Stable distribution/versioning remains a separate release gate.

## Viber signal recipe

`fixtures/viber-signal.motion.json` is an eight-second loop with four tracks on
three existing background-effect layers:

- Noise Warp phase gently oscillates between -0.75 and 0.75 noise units.
- Grain travels through 48 pattern indices and back, evaluated at 12 fps.
- Glitch has two short authored events around 1.5–1.8 and 5.1–5.6 seconds.
  Pattern phase and strength change together, then return to the authored
  baseline. Between events the original static glitch remains present.

The phone, emoji placements, Advisory and all text retain their authored
parameters. Other background effects remain present at their original amounts.
The original full conformance recipe and five-track embed variant are retained.
The standalone site offers combined, flow-only, grain-only, glitch-only and
previous-variant choices; every switch starts a new session at its neutral
frame. These are complete alternate recipes, not host-authored motion logic.
The static poster remains visible during switching and resource loading.

## Renderer and verification

New procedural fields exist only on transient render-layer copies. Zero/default
phase keeps the editor/shared renderer's static behavior unchanged. They are
not new durable EffectLayer fields and do not add editor controls or migrations.

Prepared artworks cache the unchanged chromatic-aberration sampling geometry,
not frame pixels. Its key includes size and rounded displacement, it holds at
most one map (2 MiB at 512px), and session cleanup releases it. Pixel sampling
uses the same rounded coordinates as before. GPU task scheduling is unchanged;
removing its per-effect yield was tested but did not improve the measured gate.
Consecutive GPU-only effect layers now share one upload/readback while retaining
ordered filter passes. Batches never cross a CPU/compositing layer or the
session's prefix-cache boundary. The browser proof compares this path against
separate GPU passes forced by zero-opacity fill separators, at animated time
as well as comparing neutral pixels with the previous build.

`verify:runtime-signal` installs nothing: it checks a prepared standalone npm
consumer, loading its production runtime chunk in real Chrome. It proves:

- each isolated effect changes background pixels;
- all modes preserve the opaque foreground interior (a one-pixel antialias
  fringe is excluded because composited fractional alpha can round to 255);
- out-of-order seeks are deterministic, phase steps hold, and loops close;
- batched GPU filters match separate passes at the sampled animated frame;
- Glitch returns to the original background between its two events;
- optional pixel-exact comparison against the previous build's static poster;
- combined-mode cadence and long-frame counts;
- mode switches, the retained previous variant and final font/canvas cleanup.

The regular `verify:runtime-embed` suite also checks errors, reduced motion,
lazy loading, interruption and repeated open/close cleanup. Pixel evidence
does not establish artistic acceptance. Font/asset rights still gate public
hosting; the private portable Composition remains outside the repository.
