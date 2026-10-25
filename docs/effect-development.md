# Effect Development Checklist

Use this checklist when adding, renaming, or changing an effect control. Effects
touch more surfaces than they initially appear to, so the safest path is to
update data, rendering, controls, docs, and tests in one slice.

## Required Surfaces

Effects have two levels. **Kernels** are the pixel routines the renderer runs;
**effects** are what users add and what a layer's stack stores. One effect can
run several kernels, usually one per `mode`.

- `apps/web/app/types/effectKernels.ts` declares kernels. A kernel parameter is
  one `KERNEL_PARAMS` entry (owning kernel, label, default, and a slider range,
  a color, or a `choice`; value format, help key). A kernel is one `KERNELS`
  entry (backend: `canvas` main-thread pass, `worker` pixel kernel, or `gpu`
  PixiJS filter; the amounts that turn it on; help family) and a place in
  `KERNEL_PASS_ORDER` matching where its code runs. Every amount must default
  to off. Presets, starters, help previews, and `makeEffectLayer` describe
  looks in flat kernel values.
- `apps/web/app/types/effectSchema.ts` is the catalog of effects (`EFFECTS`,
  in library order). An effect owns its parameters (with `when` to show a
  parameter only in some modes), turns them into kernel calls (`kernels`), and
  says how to rebuild each kernel's values (`absorbs`). Every kernel belongs to
  exactly one effect, and `kernels(absorb(values))` must reproduce the kernel's
  values exactly: `effectSchema.test.ts` checks both, which is what keeps
  pixels unchanged when effects merge. Use `kernelEffect` for an effect that is
  one kernel, and `modalEffect` (with `amountMode` when modes share one Amount)
  for a merged effect. `modePresets` start a mode from a preset when switching
  to it would leave the effect off.
- An effect layer is an ordered stack: `EffectLayer.effects` lists
  `EffectEntry` items (`effect`, `enabled`, and `params` holding exactly that
  effect's parameters), plus a layer `mix`. `utils/effectStack.ts` turns the
  stack into kernel calls and render runs. A kernel reads only its own
  parameters; a variant that depends on something else becomes a parameter.
- The render code: `utils/render/layers/canvasEffects.ts`, a kernel in
  `utils/render/workers/effectPixelTransform.ts`, or a filter in
  `utils/pixiFilters.ts`, matching the declared backend.
  `effectKernels.test.ts` renders every kernel and fails if it makes pixels on
  any other backend.
- A preset: `EffectPreset`, `EFFECT_PRESETS` (name, icon, kernel values),
  `EFFECT_PRESET_MENU_ORDER`, a description in `effectDocs.ts`, and its Add
  Library copy in `addLibraryModel.ts`. Add Library browses one item per
  effect (`EFFECT_ITEMS`); presets that are not an effect stay searchable and
  add their effect in the matching mode.
- Optional copy: slider help in `apps/web/app/utils/effectInfo.ts` and a docs
  note for a parameter in `effectDocs.ts`.
- If a change alters what documents store (merging effects, renaming or
  removing parameters), add a schema step under
  `apps/web/app/utils/migrations/`. Effect merges use `migrateEffectEntries`
  with a frozen table in the step file; do not derive a step from the live
  catalog. The 3 -> 4 split (`legacyEffectSplit.ts`) and the 6 -> 7 move to
  stacks (`v6ToV7.ts`) are frozen the same way.

## Validation

- Add or update a unit test for data/metadata coverage when possible.
- Add render coverage when the effect depends on aspect ratio, scale, alpha, or
  graph traversal.
- Run `npm run typecheck`, `npm run lint`, and `npm run test`.
- Use the browser smoke suite when the change affects node previews, export, or
  direct canvas interaction.

## Product Rules

- Prefer a mode of an existing effect over a new effect. A new effect layer
  holds one effect; users add more to the same layer from the inspector ("Add
  effect"), reorder them, and switch them off.
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
