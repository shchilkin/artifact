# Toolset Audit — v0.51.0 (2026-10)

Status: discovery. Findings only; scope is adopted by
[`../version-plans/toolset-consolidation.md`](../version-plans/toolset-consolidation.md).

Method: source read of the effect schema, node-kind registries, Add Library
model and starters (usage counts cover curated examples, hero configs,
starters, home and random documents), plus a walk through `/app` at 1440×900
on `development` at `12276c34`. Paths are relative to `apps/web/app/`.

## 1. Inventory

- 62 effects, 123 effect parameters (`types/effectSchema.ts`), shown as 67
  library items (62 plus 5 Bad Stream sub-presets).
- 10 layer kinds: emoji, image, text, fill, effect, primitive, model, noise,
  array, lineField (`types/config.ts`).
- 10 graph node kinds: merge, mask, color, transform, grimeShadow, repeat,
  shader (30 shader kinds behind 3 entries), material, scene3d, environment.
- Add Library: 88 items in Layers, 105 in Nodes. 14 groups.

## 2. Effects

### The effect layer is a bag

`EffectLayer extends BaseLayer, EffectParamValues` (`types/config.ts:245`):
every effect layer stores all 123 parameters of all 62 effects. `preset` only
picks which inspector sections show (`EffectInspector.tsx:29,60`); the renderer
ignores it and runs every non-zero effect in a fixed order (canvas/worker chain
in `canvasEffects.ts`, then the GPU chain in `pixiFilters.ts:373`).

Consequences:

- Hidden parameters change pixels: the `detailBlocks` preset sets
  `badStreamChroma: 28` without showing that control
  (`effectPresets.ts:182-190`).
- Pass order inside a layer is hard-coded and invisible.
- Every effect layer serializes ~123 fields.
- Effect layers have no mix/opacity.

### Usage

- Heavy: grain 30, vignette 23, scanlines 22, rgbSplit 20, bloom 19, rays 18,
  tint 16, glitch 12, duotone 11, risoShift 11, noiseWarp 10.
- 31 effects are used by no shipped content: badStream (and its 5 variants),
  pixelStretch, dotGrain, matte, emboss, linocut, sepia, infrared, solarize,
  bleachBypass, splitTone, gradientMap, channelMixer, indexedPalette,
  retroResolution, ripple, patternRefraction, kaleidoscope, squeeze, zoomBlur,
  vhsTracking, fog, speedLines, blur, threshold, edgeCrush, silhouetteCrush,
  edgeDetect, bokehBlur, hatching, gooeyMerge.

### Same math, different names

| Group | Effects | Shared math |
| --- | --- | --- |
| Luma → colour map | duotone, cyanotype, gradientMap, splitTone | `mix(stops, luma)`; cyanotype is a fixed duotone pair |
| Colour matrix | sepia, infrared, channelMixer, bleachBypass, solarize | fixed or signed 3×3 / per-channel curve |
| Overlay colour | tint, gradientOverlay, fog | flat/linear colour mixed or multiplied; tint equals a Fill layer with `multiply` |
| Quantize | posterize, dither, linocut, threshold, indexedPalette | levels + optional Bayer + optional grey/palette |
| Resolution | pixelate, retroResolution | block sampling; pixelate has non-square blocks on non-square formats (`pixiFilters.ts:116`) |
| Blur | blur, bokehBlur, zoomBlur, pixelStretch | gaussian / box+highlight / radial / directional (pixelStretch is filed under Glitch) |
| Channel split | rgbSplit, ca | R/B offset, linear vs radial |
| Row/band glitch | tear, interlace, vhsTracking | horizontal row offsets |
| Block codec | badStream (+5 presets), dataMosh | block averaging / displacement |
| Displace | wave, ripple, morph, patternRefraction, noiseWarp | displacement by a field |
| Lens | barrel, vortex, squeeze | radial remap; squeeze duplicates Transform scale |
| Symmetry | mirror, kaleidoscope | fold |
| Glow | bloom, neonGlow | bright-pass glow; bloom radius ≈ 2% of frame, nearly invisible |
| Rays | rays, speedLines | wedges / thin lines from centre |
| Screen | halftone, hatching, dotGrain | dot / line / stochastic screen |
| Grain | grain, matte | per-pixel / 48 px noise, overlay |
| Edges | emboss, edgeDetect | diagonal difference / Sobel |
| Alpha | edgeCrush, silhouetteCrush | edgeCrush is a no-op on opaque pixels (`effectPixelSpatial.ts:220`) |

### Missing basics

Brightness, contrast, saturation and hue exist only in the Nodes-only Color
node (`utils/nodeKinds/color.ts`). Nowhere: levels, curves, exposure,
temperature, invert, sharpen, drop shadow outside the Nodes-only Grime Shadow.

## 3. Nodes and sources

| Kind | Finding |
| --- | --- |
| merge, mask | Core; Nodes-only. Mask has no Layers equivalent (clip to layer below). |
| color | Only brightness/contrast/saturation control in the app; Nodes-only, unused by starters. |
| transform | Nodes-only; no on-canvas handles (handles exist for text and image only, `CanvasHandles.tsx:5-6`). |
| grimeShadow | 11-parameter dirty drop shadow; Nodes-only, filed under Structure. |
| repeat vs array | array draws built-in disc/bar/diamond in line/grid/radial; its library text says "Repeat a source" but it repeats no source (`addLibraryModel.ts:449`). repeat covers the same patterns over any branch. |
| shader | 30 kinds hidden behind "Shader Fill"; not searchable by kind; Nodes-only. Shader effects default to opacity 58 / screen. |
| 3D | Primitive layer, model layer and scene3d + material + environment are three paths. None appears in a starter (no golden coverage). scene3d is addable from Layers but dead-ends there ("Connect a model … in Nodes", `SceneTargetInspector.tsx:77`). Material presets are only pickable on primitive layers. scene3d keeps legacy `environmentSrc*` fields. |
| noise / source presets | All five procedural kinds share one ~40-field interface (`config.ts:174-215`). |
| fill | Solid only; gradients only via effect or Nodes shader. |
| text | No tracking, leading, outline or shadow; handle bounds guessed from character count (`CanvasHandles.tsx:33-38`). |

### Broken or misleading

- Graph-only nodes cannot be duplicated or bypassed: the context menu treats
  every graph node as merge (`useNodeContextMenus.ts:371`); `⌘D` hint has no
  handler (`NodeContextMenu.tsx:100`); graph nodes have no visibility field.
- ~25 library items reuse a generic family sentence ("Motion, lens warps, and
  spatial distortion.") instead of saying what they do.
- Recipes (7, Nodes-only) list parts to add one by one; wired graphs already
  exist in `starterGraphRecipes*.ts`.

## 4. Flow

- Layers cannot add mask, colour, transform, shadow, repeat, shaders,
  material or model, yet such rows appear in the Layers tree.
- Nodes opens to a blank canvas for several seconds, then a strip of small
  thumbnails; there is no large output preview in Nodes.
- No copy/paste of layers or nodes, no snapping or guides, no node search,
  no multi-select editing beyond hide/delete, 4 aspect ratios only.
