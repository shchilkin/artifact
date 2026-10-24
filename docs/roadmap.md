# Roadmap

This file is the only place that lists active work and its order. Each entry
links to its version plan. Shipped history (v0.1 to v0.50) lives in
[`archive/roadmap-to-v0.50.md`](./archive/roadmap-to-v0.50.md), with older plans
in [`archive/version-plans/`](./archive/version-plans/).

## Current Release

v0.50.0 Editor UX was released on 2026-10-05
([release notes](./releases/v0.50.0.md)).

## Active And Planned

Plans are listed in order and carry no version number until they ship; the
next release takes the next number (see
[`version-planning.md`](./version-planning.md), "Numbering").

| Order | Plan | Thesis | Status |
| --- | --- | --- | --- |
| v0.51.0 | [Core Reset](./version-plans/v0.51.md) + Editor Polish Patch ([v0.50](./version-plans/v0.50.md), [#448](https://github.com/shchilkin/artifact/issues/448)) | One topology source, node and effect registries; the v0.50 editor keeps its promises | release prep |
| next | [Editor Polish](./version-plans/editor-polish.md) | One control grammar across editor surfaces | planned |
| after | [AI-Assisted Creation](./version-plans/ai-assisted-creation.md) | Chat and context assistant on the converged editor | planned |

Decision (2026-10-24): the owner chose to release `development` as it is. The
Core Reset (planned as v0.53) and the Editor Polish Patch (planned as v0.50.1)
ship together as v0.51.0.

## Known Core Risks

These are addressed by v0.51 unless noted.

- Per-kind node arrays and a flat `EffectLayer`, so new nodes and effect
  parameters need edits across many files.
- Mixed document update paths; some silent writes skip undo.
- Large mixed-responsibility files (`types/config.ts`,
  `render/layers/index.ts`, `documentPersistence.ts`, `useDocumentRenderer.ts`,
  `NodeCanvas.tsx`, `editor.tsx`).
- `CanvasHandles` commits text/image transform movement on every pointer move
  instead of once per gesture (not yet in a plan).
- GPU/PixiJS and Three.js output have no visual tolerance strategy (not yet in a
  plan).

## Parked Ideas

Ideas without a plan live in [`archive/feature-intake.md`](./archive/feature-intake.md).
They become scope only through a version plan.
