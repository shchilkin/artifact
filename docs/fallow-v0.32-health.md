# Fallow v0.32 Health Review

Captured on 2026-06-06 with JSON/quiet Fallow commands during v0.32 release
prep.

Canonical complexity review command:

```bash
FALLOW_AGENT_SOURCE=codex npx fallow health --format json --quiet --explain --score --complexity --top 30 > /private/tmp/artifact-fallow-v0.32-complexity.json 2>/dev/null || true
```

Changed-code audit command:

```bash
FALLOW_AGENT_SOURCE=codex npm run --silent fallow:audit -- --base origin/development > /private/tmp/artifact-fallow-v0.32-audit.json 2>/dev/null || true
```

The changed-code audit returned `verdict: "pass"` with zero dead-code issues,
zero complexity findings, and zero duplication clone groups.

Do not treat this review as a deletion or suppression list. Every refactor that
touches document state, graph traversal, rendering, export, persistence, local
storage, or node-editor behavior still needs trace review, the lowest useful
tests, and the normal release gate.

## Summary

| Area | Count |
| --- | ---: |
| Health score | 88.4 / A |
| Files analyzed | 359 |
| Functions analyzed | 4,907 |
| Functions above threshold | 75 |
| Critical complexity findings | 19 |
| High complexity findings | 19 |
| Moderate complexity findings | 37 |
| Changed-code dead-code issues | 0 |
| Changed-code complexity findings | 0 |
| Changed-code duplication clone groups | 0 |

## Top Hotspots

| Path | Function | Line | Classification |
| --- | --- | ---: | --- |
| `apps/web/app/utils/randomConfig.ts` | `randomLayerSection` | 636 | Real refactor target; needs deterministic random/preset fixture coverage. |
| `apps/web/app/utils/randomConfig.ts` | `randomEffectPresetLayer` | 461 | Real refactor target; high CRAP because the large branch table is undercovered. |
| `apps/web/app/components/node-canvas/NodeCanvas.tsx` | `NodeCanvas` | 63 | Real refactor target, but performance-sensitive; split only behind browser and perf coverage. |
| `apps/api/src/auth.ts` | `verifySignedBearerToken` | 159 | API auth plumbing; keep visible until API auth tests and token failure cases are expanded. |
| `apps/web/app/components/add-library/AddLibraryPreview.tsx` | `renderFallbackPreviewDataUrl` | 238 | Real refactor target; needs preview parity fixtures before changing fallback rendering. |
| `apps/web/app/utils/documentPersistence.ts` | `assets` | 98 | Persistence migration hotspot; defer broad changes to a storage-focused version. |
| `apps/api/src/routes/ai.ts` | `handleCreateGenerationRequest` | 105 | API product endpoint; defer until AI request validation and quota tests are expanded. |
| `apps/api/src/config.ts` | `loadConfig` | 59 | Workspace/config plumbing; keep visible, but do not suppress until env matrix is documented. |
| `apps/web/app/components/node-canvas/inspector/EffectInspector.tsx` | `EffectInspector` | 21 | UI split target; safe only when effect-control parity tests cover the split. |
| `apps/web/app/components/SiteNav.tsx` | `SiteNav` | 19 | Presentational branching; candidate for component split, not a release blocker. |
| `apps/web/app/components/node-canvas/nodeAlignment.ts` | `snapNodeToAlignment` | 59 | Pure helper refactor target; good candidate for focused unit tests. |
| `apps/web/app/components/node-canvas/nodeChanges.ts` | change mapper | 75 | Pure node-change helper; good candidate for focused unit tests. |
| `apps/web/app/components/add-library/AddLibraryPreview.tsx` | `makeAddLibraryPreviewDocument` | 83 | Real refactor target; tie to Add Library preview fixture coverage. |
| `apps/api/src/routes/ai.ts` | `handleAiRequest` | 39 | API route plumbing; defer to API handler split. |
| `apps/web/app/components/node-canvas/nodes/NodeShell.tsx` | `NodeShell` | 7 | Presentational state branching; split only if it improves node state readability. |

## v0.32 Decisions

- Keep the full-health complexity report non-blocking for v0.32. Historical
  hotspots remain visible, but only changed-code Fallow audit is blocking.
- Keep the existing inline suppressions limited to trace-backed path-only
  rename noise from the `generator` to `editor` migration. Do not add broad
  suppressions for the historical complexity list.
- Fix React hook dependency warnings in changed code instead of weakening lint
  rules.
- Defer broad `NodeCanvas`, persistence, renderer, Add Library preview, random
  preset, and API handler refactors until each has focused tests and a smaller
  release thesis.
- Treat pure helper hotspots such as node alignment and node changes as the
  safest next complexity targets because they can be tested below the browser
  layer.

## CSS Boundary Review

`apps/web/app/components/node-canvas/node-canvas.css` remains a large editor
surface with these ownership areas:

- canvas shell and panel composition;
- nodes, node handles, edges, output-path state, selected state, muted state,
  and graph-only utility nodes;
- graph areas and area context menus;
- pane, node, edge, insert, and Add Library menu surfaces;
- inspector and property-panel chrome;
- thumbnails, gallery previews, and output previews;
- primitive camera controls and responsive editor behavior.

Tailwind-first remains useful for route shells, simple flex/grid layout,
spacing wrappers, responsive visibility, and low-state UI around existing
components. It is not the right default for the node editor chrome because the
stateful graph geometry and selected/output/drag/hover variants would move
complexity from CSS into long JSX class strings.

v0.32 keeps editor and graph styling CSS-first. Future CSS reduction should
split the file by feature ownership or move repeated controls into shared
primitives, not rewrite graph-specific behavior as utilities.

## Deferred Risk Register

- `randomConfig.ts`: branch-table complexity should be extracted behind
  deterministic generation fixtures.
- `NodeCanvas.tsx`: split orchestration carefully; rerun browser and
  `npm run perf:node-editor` for any meaningful change.
- `AddLibraryPreview.tsx`: preview construction and fallback data URLs need
  fixture coverage to preserve preview/export expectations.
- `documentPersistence.ts`: asset migration and local recovery remain
  storage-risky; defer broad changes to storage UX/capability hardening.
- API auth/AI handlers: route complexity remains visible, but the browser
  editor release should not absorb API behavior changes without a focused API
  test plan.
- Full-health gate: make it blocking only after intentional hotspots have
  trace-backed suppressions or focused refactors.
