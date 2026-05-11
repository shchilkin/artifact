# COPILOT.md

This repo is a browser-only React Router app with a hybrid layer-stack and node-canvas editor. Use these instructions when making changes, and see `AGENTS.md` for the fuller QA and architecture playbook.

## Core rules

- `CanvasDocument` in `app/types/config.ts` is the canonical source of truth.
- `doc.graph` is optional, serialized state; keep it JSON-safe.
- Graph logic belongs in `app/utils/nodeGraph.ts`.
- Node canvas UI belongs in `app/components/node-canvas/*`.
- Document/history/persistence logic belongs in `app/hooks/useGeneratorDocument.ts`.
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

- `app/utils/nodeGraph.ts`
- `app/components/node-canvas/machine.ts`
- `app/components/node-canvas/helpers.ts`

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

No browser test runner is configured today. Do not add Playwright or Cypress unless the task specifically calls for it. If one is added later, focus on connect-drag, pan/zoom, selection, and graph-backed preview/export flows.

## Change checklist

When adding or changing graph behavior, check whether you also need to update:

1. graph types/factories in `app/types/config.ts`
2. graph helpers in `app/utils/nodeGraph.ts`
3. document sync in `app/hooks/useGeneratorDocument.ts`
4. node creation/rendering in `app/components/node-canvas/buildRFNodes.ts`
5. node UI and properties panels in `app/components/node-canvas/*`
6. docs in `AGENTS.md`, `.github/copilot-instructions.md`, `CLAUDE.md`, or `app/routes/docs.nodes.tsx`
7. tests

## Existing commands

```bash
npm run dev
npm run typecheck
npm run lint
npm run test
npm run build
```

## Guardrails

- Prefer immutable document updates.
- Keep graph math out of React components when possible.
- Do not add new UI-only assumptions to serialized graph state.
- Test cycle blocking as a rejected connection path, not as an exception, unless implementation changes.
- Mock heavy rendering dependencies when testing pipeline flow.
