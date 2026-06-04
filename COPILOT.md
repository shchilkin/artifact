# COPILOT.md

This repo is a browser-only React Router app with a hybrid layer-stack and node-canvas editor. Use these instructions when making changes, and see `AGENTS.md` for the fuller QA and architecture playbook.

## Read architecture docs first

Before changing state ownership, rendering, node editor behavior, thumbnails, preview/export parity, or 3D primitive controls, read:

- `docs/state-model.md`
- `docs/rendering.md`
- `docs/node-editor.md`
- `docs/effect-development.md`
- `docs/style-guide.md`
- `docs/editor-design-system.md`
- `docs/improvement-plan.md`
- `docs/roadmap.md`
- `docs/version-planning.md`
- `docs/production-readiness.md`

Prefer these docs over older inline summaries when they disagree. Update the relevant doc in the same change when architecture or interaction rules change.

## User-facing copy boundary

Do not put internal agent/process language on app surfaces. Migration plans,
test strategy, release-plan notes, QA wording, and implementation commentary
belong in `docs/` by default, not in route copy, editor panels, public docs, or
style-guide surfaces. Avoid UI copy like "baseline", "migrate carefully",
"before broad adoption", or "focused Playwright checks" unless building an
explicit internal operations page.

## Core rules

- `CanvasDocument` in `apps/web/app/types/config.ts` is the canonical source of truth.
- `doc.graph` is optional, serialized state; keep it JSON-safe.
- Graph logic belongs in `apps/web/app/utils/nodeGraph.ts`.
- Node canvas UI belongs in `apps/web/app/components/node-canvas/*`.
- Document/history/persistence logic belongs in
  `apps/web/app/hooks/useGeneratorDocument.ts`.
- Public rendering imports belong at `apps/web/app/utils/renderer.ts`;
  implementation internals live under `apps/web/app/utils/render/`.
- The main cover preview intentionally renders with `graphMode: 'stack'`.
- Graph-target previews intentionally render through graph traversal.

Do not let React Flow UI details define graph semantics.

## Node-based development strategy

1. **Pure logic first.** Implement graph rules, traversal, and validation in testable helpers before touching UI.
2. **State sync second.** Wire model changes through document normalization, history, localStorage, and URL import paths.
3. **UI third.** Update React Flow nodes, handles, menus, and panels only after the underlying rule is stable.
4. **Preserve serialization.** Never store DOM nodes, renderer instances, or other non-serializable objects in graph/document state.
5. **Protect dual rendering paths.** Be explicit about whether a change affects stack preview, graph preview, export, or all three.

## Testing priorities

Prefer `Vitest` and the lowest layer that proves the behavior.

### Unit

- `apps/web/app/utils/nodeGraph.ts`
- `apps/web/app/components/node-canvas/machine.ts`
- `apps/web/app/components/node-canvas/helpers.ts`
- `tests/browser/*` for browser-only regressions such as WebGL, export downloads,
  and tab-switch rendering bugs

Examples of high-value coverage:

- edge insertion/removal and edge splitting
- cycle prevention with `wouldCreateCycle(...)`
- render-order traversal
- selection-state transitions

### Integration

- `useGeneratorDocument` sync between layers, graph, history, and persistence
- document serialization/deserialization via localStorage and `?doc=`
- graph-aware preview behavior where traversal mode matters

### Browser/E2E

Playwright browser tests live under `tests/browser/` and are run through the
root `npm run test:browser` wrapper. Keep them focused on browser-only
regressions: WebGL, export downloads, local gesture isolation, pan/zoom,
selection, and graph-backed preview/export flows.

## Change checklist

When adding or changing graph behavior, check whether you also need to update:

1. graph types/factories in `apps/web/app/types/config.ts`
2. graph helpers in `apps/web/app/utils/nodeGraph.ts`
3. document sync in `apps/web/app/hooks/useGeneratorDocument.ts`
4. node creation/rendering in `apps/web/app/components/node-canvas/buildRFNodes.ts`
5. node UI and properties panels in `apps/web/app/components/node-canvas/*`
6. graph-aware rendering in `apps/web/app/utils/render/graph.ts` when the node affects pixels
7. docs in `AGENTS.md`, `.github/copilot-instructions.md`, `CLAUDE.md`, or `apps/web/app/routes/docs.nodes.tsx`
8. tests

For state, rendering, or node-editor changes, also update the matching file in `docs/`.

## Existing commands

```bash
npm run dev
npm run favicon
npm run typecheck
npm run lint
npm run test
npm run test:browser
npm run build
```

## Guardrails

- Prefer immutable document updates.
- Keep graph math out of React components when possible.
- Do not add new UI-only assumptions to serialized graph state.
- Test cycle blocking as a rejected connection path, not as an exception, unless implementation changes.
- Mock heavy rendering dependencies when testing pipeline flow.
