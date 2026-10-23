# Effect Development Checklist

Use this checklist when adding, renaming, or changing an effect control. Effects
touch more surfaces than they initially appear to, so the safest path is to
update data, rendering, controls, docs, and tests in one slice.

## Required Surfaces

- `apps/web/app/types/effectSchema.ts` is the source of truth. A new parameter
  is one `EFFECT_PARAMS` entry (owning effect, label, default, slider range or
  color, value format, help key) plus its place in an `EFFECT_SECTIONS`
  list. A new effect also gets an `EFFECTS` entry: its backend
  (`canvas` main-thread pass, `worker` pixel kernel, or `gpu` PixiJS filter),
  the amounts that turn it on, and its help family. `EffectLayer`,
  `DEFAULT_EFFECT_LAYER_PROPS`, `ZERO_EFFECT`, the backend activation checks,
  inspector controls, preset splitting (`effectPresetPatch.ts`), docs ranges
  (`effectDocs.ts`), and help families are derived from it.
- The render code: the Canvas 2D pass in
  `apps/web/app/utils/render/layers/index.ts`, a kernel in
  `apps/web/app/utils/render/workers/effectPixelTransform.ts`, or a filter in
  `apps/web/app/utils/pixiFilters.ts`, matching the declared backend.
  `effectSchema.test.ts` renders every effect and fails if it makes pixels on
  any other backend.
- A new focused preset: `EffectPreset`, `EFFECT_PRESETS` (name, icon, values),
  `EFFECT_PRESET_MENU_ORDER`, and its description in `effectDocs.ts`. A preset
  that is a variant of another effect (like the codec block presets of Bad
  Stream) goes in `EFFECT_PRESET_VARIANTS` with the parameters it shows.
- Optional copy: slider help in `apps/web/app/utils/effectInfo.ts`, a docs note
  for a parameter in `effectDocs.ts`, and a section summary in
  `components/node-canvas/inspector/effectSectionModel.ts`.
- If the effect changes how existing documents store data, add a schema
  migration step under `apps/web/app/utils/migrations/` instead of a load-time
  branch. The schema 3 -> 4 effect split is frozen in
  `migrations/legacyEffectSplit.ts`; do not derive it from the schema.

## Validation

- Add or update a unit test for data/metadata coverage when possible.
- Add render coverage when the effect depends on aspect ratio, scale, alpha, or
  graph traversal.
- Run `npm run typecheck`, `npm run lint`, and `npm run test`.
- Use the browser smoke suite when the change affects node previews, export, or
  direct canvas interaction.

## Product Rules

- Prefer focused single-effect nodes over legacy combined FX.
- Keep controls named by what the user sees, not by implementation details.
- If an effect uses output size, make the scale behavior explicit so preview
  and export density match.
- If an effect uses seeded randomness, read `doc.global.seed + layer.seedOffset`
  in both Canvas 2D and GPU paths so one effect node can vary without
  re-rolling the whole document.
- Every slider has numeric entry. It commits on Enter or blur, clamped to the
  range and snapped to the slider step from `min`, so it stores the same values
  the slider can. A typed value outside the range briefly shows the limit it
  was clamped to, such as "Max 100". If a slider needs creative values beyond
  the common range, set `overrideMax` so numeric entry accepts them instead of
  hiding the capability.
- Help text in `effectInfo.ts` may only promise typing past the slider for a
  control with `overrideMax`, and must name that control and its real limits
  ("Type a Count up to 240; the slider stops at 96."). A unit test in
  `EffectControlSections.test.ts` checks this.
- Slider help opens from the "About …" button on click, Enter, or Space, closes
  on Escape, and sits beside its row through the shared `Popover`
  (`InspectorSlider` `help` prop).
- Give a slider a `valueFormat`; it is read out through the slider's
  `aria-valuetext`, and `%`, `px`, and `deg` also show as a unit after the
  numeric entry.
