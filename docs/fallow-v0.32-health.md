# Fallow v0.32 Health Review

Captured on 2026-06-06 with JSON/quiet Fallow commands during v0.32 release
prep.

Canonical complexity review command:

```bash
FALLOW_AGENT_SOURCE=codex npx fallow health --format json --quiet --explain --score --complexity --top 200 > /private/tmp/artifact-fallow-v0.32-complexity.json 2>/dev/null || true
```

Changed-code audit command:

```bash
FALLOW_AGENT_SOURCE=codex npm run --silent fallow:audit -- --base origin/development > /private/tmp/artifact-fallow-v0.32-audit.json 2>/dev/null || true
```

The final full-health complexity report returned zero functions above threshold,
zero critical findings, zero high findings, and zero moderate findings. The
changed-code audit returned `verdict: "pass"` with zero dead-code issues, zero
complexity findings, and zero duplication clone groups.

Do not treat this review as a deletion or suppression list. Every refactor that
touches document state, graph traversal, rendering, export, persistence, local
storage, or node-editor behavior still needs trace review, the lowest useful
tests, and the normal release gate.

## Summary

| Area | Count |
| --- | ---: |
| Health score | 91.4 |
| Files analyzed | 360 |
| Functions analyzed | 5,269 |
| Functions above threshold | 0 |
| Critical complexity findings | 0 |
| High complexity findings | 0 |
| Moderate complexity findings | 0 |
| Changed-code dead-code issues | 0 |
| Changed-code complexity findings | 0 |
| Changed-code duplication clone groups | 0 |

## Resolved Hotspot Areas

| Area | Resolution |
| --- | --- |
| `apps/web/app/utils/randomConfig.ts` | Replaced large preset and section branch chains with table-driven randomizers and focused helpers. |
| `apps/web/app/components/node-canvas/NodeCanvas.tsx` | Split pane, node, keyboard, gallery, edge, and portal orchestration into named helpers without changing graph semantics. |
| `apps/api/src/routes/ai.ts` | Split route matching, request validation, quota/capacity checks, create flow, and response helpers. |
| `apps/api/src/auth.ts` and provider files | Split token/config/provider response plumbing into smaller helpers while preserving API behavior. |
| `apps/web/app/components/add-library/AddLibraryPreview.tsx` | Moved preview construction toward builder maps and smaller fallback rendering helpers. |
| `apps/web/app/components/node-canvas/*` | Split node shells, thumbnails, primitive preview surfaces, context menus, inspectors, debug overlays, graph events, gallery state, add-library drop hints, and transform drafts. |
| `apps/web/app/routes/home.tsx` and `showcase.tsx` | Split rendering, thumbnail workers, scroll/key handling, canvas swap, noise, and page sections into focused helpers/components. |
| `apps/web/app/utils/documentPersistence.ts` | Split portable asset normalization helpers and simplified related tests without changing persistence format. |

## v0.32 Decisions

- Keep the changed-code Fallow audit blocking and record the full-health
  complexity report as clean for v0.32.
- Do not add broad suppressions for historical complexity. The v0.32 cleanup
  resolved the full-health complexity list through refactors instead.
- Fix React hook dependency warnings in changed code instead of weakening lint
  rules.
- Keep renderer, graph traversal, export, persistence schema, package export,
  AI scope, and font policy semantics unchanged.
- Treat future full-health complexity gating as a CI policy decision: the
  report is clean now, but the project still needs explicit policy for
  thresholds, suppressions, and review ownership before making it a permanent
  release blocker.

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

- Renderer/export semantics, graph traversal, persistence schema, package
  export, AI scope, and font policy remain deferred out of v0.32.
- `node-canvas.css` remains a large feature-owned surface. Future reduction
  should split by ownership or shared primitives, not by broad utility rewrite.
- Storage UX and browser capability hardening remain future product tracks:
  autosave visibility, recovery, quota pressure, project size, cleanup, and
  unsupported WebGL/storage/file APIs still need dedicated design.
- Full-health gate policy is a future CI decision even though the current
  report is clean. The project should document threshold ownership and
  suppression rules before making it a standing release blocker.
