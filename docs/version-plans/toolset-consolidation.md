# Toolset Consolidation

Status: in progress, unnumbered until it ships (see
[`../version-planning.md`](../version-planning.md)); it goes before
[Editor Polish](./editor-polish.md). Findings live in
[`../discovery/toolset-audit-2026-10.md`](../discovery/toolset-audit-2026-10.md).

## Purpose

Artifact offers 62 effects, 10 layer kinds and 10 graph node kinds through an
Add Library of 88 (Layers) to 105 (Nodes) items. Half the effects are
variations of the same math under different names, 31 are used by no shipped
content, and an effect layer stores all 123 parameters of every effect. Basic
tools a cover editor needs (brightness/contrast in Layers, drop shadow, gradient
fill, typography) are missing or locked in Nodes.

The release thesis is: **fewer, deeper tools.** Every effect is one named tool
with modes; every capability a cover needs is reachable from Layers; nothing in
the library is a duplicate, a dead end or a no-op.

Primary blast radius: document model and editor workflow (effect layer schema,
effect catalog, Add Library). Render output of existing documents is preserved.

## Scope

### 1. Fix what is broken (no schema change)

- Duplicate, Hide (bypass) and `⌘D` work on every graph node kind.
- Every library item has its own one-line description (no family boilerplate).
- Array's description says what it does.
- Nodes starts loading when the pointer or focus reaches the Nodes tab and
  shows a loading state instead of a blank canvas.

### 2. Effect layer becomes an ordered effect stack

Replace the parameter bag with an explicit list:

```ts
interface EffectLayer extends BaseLayer {
  effects: EffectEntry[]; // applied top to bottom
  mix: number;            // 0..100, new
  blend: BlendMode;
  maskAlpha: ...;
}
type EffectEntry = { id: string; effect: EffectId; enabled: boolean } & EffectParamsOf<EffectId>;
```

- Adding an effect from the library creates a layer with one entry. The
  inspector shows the entries in order, each collapsible, reorderable, with an
  on/off toggle and "Add effect to this layer".
- Migration: each stored bag becomes the list of its active effects in today's
  hard-coded pass order, so output is identical. Inactive parameters are
  dropped.
- Each `EffectId` declares only its own parameters in `EFFECT_PARAMS`.

### 3. Merge the catalog: 62 effects → 27

Each merged effect keeps the old kernels and dispatches on `mode`, so the
migration only renames fields.

| Family | Effect (modes) | Absorbs |
| --- | --- | --- |
| Color | **Adjust** (brightness, contrast, saturation, hue, exposure, temperature, invert) | hueShift, Color node |
| | **Gradient Map** (duo / tri / split) | duotone, cyanotype, gradientMap, splitTone |
| | **Color Filter** (sepia / infrared / bleach / solarize / mixer) | sepia, infrared, bleachBypass, solarize, channelMixer |
| | **Color Overlay** (solid / linear; blend; luma weight) | tint, gradientOverlay, fog |
| | **Posterize** (levels, dither, grey, cutoff, palette) | posterize, dither, linocut, threshold, indexedPalette |
| | **Vignette** | — |
| Light | **Glow** (bloom / neon) | bloom, neonGlow |
| | **Rays** (wedges / lines) | rays, speedLines |
| | **Film Burn** | — |
| Texture | **Grain** (fine / coarse) | grain, matte |
| | **Halftone** (dots / lines / stochastic) | halftone, hatching, dotGrain |
| | **Scanlines** | — |
| | **Edges** (emboss / outline) | emboss, edgeDetect |
| Print | **Misregister**, **Overprint** | risoShift, overprint |
| Signal | **Channel Split** (linear / radial) | rgbSplit, ca |
| | **Line Glitch** (streaks / tear / interlace / tracking) | glitch, tear, interlace, vhsTracking |
| | **Compression** (codec / block shift) | badStream + 5 presets, dataMosh |
| Warp | **Displace** (wave / ripple / liquid / pattern / noise) | wave, ripple, morph, patternRefraction, noiseWarp |
| | **Lens** (barrel / swirl / squeeze) | barrel, vortex, squeeze |
| | **Symmetry** (mirror / kaleidoscope) | mirror, kaleidoscope |
| Blur | **Blur** (gaussian / lens / zoom / motion) | blur, bokehBlur, zoomBlur, pixelStretch |
| | **Pixelate** (blocks / retro resolution) | pixelate, retroResolution |
| Shape | **Alpha Crush** (harden / chip), **Gooey** | edgeCrush, silhouetteCrush, gooeyMerge |
| New | **Sharpen**, **Shadow** (soft / grime) | grimeShadow node |

Old effect names stay searchable as keywords and as library presets of the new
effect (searching "Sepia" adds Color Filter in sepia mode).

### 4. Layers can do what a cover needs

- Adjust and Shadow (above) are effects, so both modes get them.
- Fill gets linear and radial gradient modes.
- Text gets tracking, leading, outline and shadow.
- Any layer can clip to the layer below (Layers form of the Mask node).
- Recipes insert their wired subgraph in one action.

### 5. Sources and 3D

- Array becomes a Repeat preset over a built-in shape, or stays with a
  correct name; decided by a prototype.
- 3D Scene stays in Layers, where it wraps the selected primitive, until the
  3D Object below replaces it.
- Decided (2026-10-24): one "3D Object" source (primitive or model) with Material, Lighting and
  Environment inspector sections; environment folds into it; legacy
  `environmentSrc*` fields migrate away.

## Non-Goals

- No pixel change to existing documents. Golden fixtures stay unchanged; the
  only approved change is the pixelate non-square-block fix, which needs an
  explicit baseline update.
- No new visual direction and no editor chrome convergence; that is
  [Editor Polish](./editor-polish.md).
- No AI-Assisted Creation scope.
- No mobile flow redesign.

## Acceptance Criteria

1. `EFFECTS` has ≤ 27 entries; every legacy effect id maps to an effect + mode
   in a migration step with a fixture test.
2. A migrated effect layer stores only the parameters of its listed effects.
3. Every golden render fixture is unchanged after migration (pixelate excepted
   if approved).
4. Add Library has ≤ 60 items in Nodes, every item description is unique, and
   every legacy effect name finds its new item by search.
5. Duplicate, Hide and `⌘D` work on every graph node kind (browser test).
6. Brightness/contrast, drop shadow, gradient fill and text tracking are
   reachable from Layers without opening Nodes.
7. Inserting a recipe produces a connected graph that renders (unit test per
   recipe).
8. `npm run check`, `npm run test:golden` and `npm run ux:gate` pass.

## Delivery Sequence

1. Phase 1 fixes (independent PRs). Done.
2. Effect stack schema + migration (one PR, model first). Done: schema 7,
   golden fixtures unchanged. Bad Stream's sub-presets became its
   `badStreamStages` parameter; the retro-finish recipe card in the effect
   inspector was removed with the old per-family sections.
3. Catalog merges, one schema step per family (8-17). Done: 61 kernels are
   now 26 effects; golden fixtures unchanged. Adjust and Sharpen are new
   kernels. Shadow moves to step 4 with the Grime Shadow node, since it needs a
   graph-node migration. Add Library browses 48 items in Layers (from 88) and
   65 in Nodes (from 105); the rest of the Nodes target needs the source and
   3D work of step 5.
4. Layers capabilities. Done: Shadow effect (schema 18 migrates Grime Shadow
   nodes, pixel-identical), effect layers that apply to the layer below,
   gradient fills, text tracking/leading/outline/shadow, clip to layer below,
   and recipes that insert their wired graph.
5. Sources and 3D, after a prototype.
