# Roadmap

This file is the only place that lists active work and its order. Each entry
links to its version plan. Shipped history (v0.1 to v0.50) lives in
[`archive/roadmap-to-v0.50.md`](./archive/roadmap-to-v0.50.md), with older plans
in [`archive/version-plans/`](./archive/version-plans/).

## Current Release

v0.50.0 Editor UX was released on 2026-10-05
([release notes](./releases/v0.50.0.md)).

## Active And Planned

| Version | Thesis | Plan | Status |
| --- | --- | --- | --- |
| v0.50.1 | Editor Polish Patch ([#448](https://github.com/shchilkin/artifact/issues/448)) | [v0.50](./version-plans/v0.50.md) | in progress |
| v0.51 | One control grammar across editor surfaces | [v0.51](./version-plans/v0.51.md) | planned |
| v0.52 | AI-Assisted Creation | [v0.52](./version-plans/v0.52.md) | planned |
| v0.53 | Core Reset: one topology source, node and effect registries | [v0.53](./version-plans/v0.53.md) | Phases 0-6 done, not released |

Sequencing note (2026-10-23): the owner started the Core Reset ahead of its
version number. Whether v0.53 phases run before, alongside, or after v0.51 and
v0.52 is an open owner decision; update this table when it is made.

## Known Core Risks

These are addressed by v0.53 unless noted.

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
