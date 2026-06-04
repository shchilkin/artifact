# Effect Development Checklist

Use this checklist when adding, renaming, or changing an effect control. Effects
touch more surfaces than they initially appear to, so the safest path is to
update data, rendering, controls, docs, and tests in one slice.

## Required Surfaces

- `apps/web/app/types/config.ts`: add durable fields to `EffectLayer`,
  `DEFAULT_EFFECT_LAYER_PROPS`, focused preset metadata, and menu order.
- `apps/web/app/components/node-canvas/inspector/EffectInspector.tsx`: expose durable
  controls, labels, ranges, override ranges, and info-popover keys.
- `apps/web/app/utils/effectInfo.ts`: add slider/help metadata and popup preview
  overrides.
- `apps/web/app/utils/effectDocs.ts`: add user-facing docs text, key parameters, and
  ranges for the node docs page.
- `apps/web/app/utils/render/layers/index.ts`: implement or route the actual pixel pass.
- `apps/web/app/utils/randomConfig.ts`: include randomization/zeroing behavior if the
  effect can be randomized from the classic layer controls.
- `apps/web/app/utils/effectLayerMigration.ts`: migrate legacy combined effect state if
  the new effect replaces or splits older behavior.

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
- If a slider needs creative values beyond the common range, expose an override
  input instead of hiding the capability.
