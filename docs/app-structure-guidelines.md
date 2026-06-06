# App Structure Guidelines

This document defines how the app should be organized as it grows. The goal is
to keep feature work direct, reduce cross-file guesswork, and make future UI
changes safer. For editor UI tokens, shared primitives, style-guide rules, and
Radix/shadcn boundaries, read [`style-guide.md`](./style-guide.md) first, then
[`editor-design-system.md`](./editor-design-system.md) for editor-specific
migration details.

## Guiding principles

| Principle | Rule |
| --- | --- |
| One canonical model | `CanvasDocument` remains the source of renderable truth. UI state can wrap it, but should not fork it. |
| Feature folders first | Components that only serve one surface stay inside that surface folder. Shared utilities move out only after reuse is real. |
| Explicit variants | Prefer `PrimitivePreviewSurface` or `MediaPreviewSurface` over one component with many mode branches. |
| Thin render components | Components should render markup. Hooks should own subscriptions, effects, async rendering, and cache coordination. |
| Dependency-injected state | UI reads state through context interfaces or props. It should not know which top-level hook stores the data. |
| Preview equals export | Thumbnail, gallery, preview, and export must call the same render pipeline unless the difference is intentional and documented. |

## Current high-level folders

| Folder | Responsibility |
| --- | --- |
| `apps/api` | Same-repo VPS backend scaffold for v0.13 AI generation: auth checks, jobs, worker, queue, provider adapters, storage, and DB boundaries. |
| `apps/web` | Vercel React Router app workspace and browser editor package. |
| `apps/web/app/routes` | Route-level composition and page shells. Keep business logic out when a hook or feature folder can own it. |
| `apps/web/app/components` | Reusable UI and feature UI. Large surfaces should have subfolders with their own components, hooks, and helpers. |
| `apps/web/app/components/node-canvas` | Node editor feature module: React Flow integration, node components, previews, inspector, menus, and editor state. |
| `apps/web/app/hooks` | Cross-surface hooks used by route-level composition. Avoid putting node-only or renderer-only hooks here. |
| `apps/web/app/types` | Serializable app model, factories, migrations, and schema-level constants. |
| `apps/web/app/utils` | Rendering, export, graph algorithms, deterministic random helpers, and other non-React logic. |

## Component design rules

## Styling strategy

Tailwind is available in the web workspace and should be treated as the first
choice for simple structure: route shells, flex and grid layout, spacing,
responsive visibility, alignment, and low-state wrappers. Tailwind is not the
visual system. Artifact's visual contract still comes from `DESIGN.md`, shared
CSS tokens, and feature-level CSS.

Use this decision rule:

| Surface | Default approach |
| --- | --- |
| Simple route/page layout | Tailwind-first utilities. |
| Reused public UI | Shared component in `apps/web/app/components/ui/*` plus colocated CSS for its stable visual contract. |
| Editor and graph surfaces | CSS-first feature styles using semantic/feature tokens. |
| Canvas, renderer, thumbnails, and showcase artwork walls | CSS-first when aspect ratios, hover states, masonry behavior, or art direction are part of the product. |
| One-off spacing/alignment around existing components | Tailwind utilities. |

When a Tailwind class string becomes long, repeated, or filled with state
branches, extract a component or explicit variant instead of copying more
utilities. Shared primitives should expose product-shaped APIs such as
`ActionButton`, `ActionLink`, `NodeFrame`, or `LayerPreviewSurface`; callers
should not reassemble the same chrome from utility strings.

Use tokens instead of ad hoc colors. Prefer CSS variables and token aliases such
as `var(--bg)`, `var(--text)`, `var(--accent)`, `bg-bg`, or `border-border`
over arbitrary color literals in JSX. Arbitrary Tailwind values are acceptable
only for local geometry that does not describe reusable product meaning.

Keep internal planning language out of app copy. Version-plan notes, migration
instructions, QA strategy, test names, release gates, and agent workflow text
belong in `docs/` by default. App routes and components should only render copy
that helps the person using that surface.

Third-party primitive libraries may help with accessibility and interaction
mechanics, but they must not define Artifact's look. shadcn/Radix primitives
must stay source-owned under `apps/web/app/components/ui/*`, use Artifact
tokens, and expand one behavior family at a time after validation. Do not
import default shadcn visual patterns as the product shell.

### Use explicit variants instead of boolean modes

If a component has multiple layouts or interaction models, split it into named
variants. A good target shape is:

```tsx
<LayerPreviewSurface ... />
<PrimitivePreviewSurface ... />
<NodeThumbnail ... />
```

Avoid APIs like:

```tsx
<PreviewSurface primitive selected live draggable modal />
```

Boolean combinations hide impossible states and make future edits risky.

### Keep frames separate from content

Reusable frames should own shared chrome and behavior. Content components should
only describe the variant-specific body.

Current node example:

| Component | Owns |
| --- | --- |
| `NodeFrame` | React Flow handles, shell frame, keyboard selection, z-index, delete action |
| `NodeShell` | Visual node chrome: accent, header, title, body slot |
| `LayerNodeComponent` | Layer-specific ports, preview, and transform draft wiring |
| `PrimitivePreviewSurface` | Primitive viewport, camera lock/reset/view actions |

When adding a node type, start by composing `NodeFrame`. Do not copy the full
React Flow handle and shell structure into a new component.

### Hooks own effects and async work

Async rendering, timers, image preload, cache lookup, and subscriptions should
live in hooks. Rendering components should receive the result and draw markup.

Current thumbnail shape:

| File | Owns |
| --- | --- |
| `NodeThumbnail.tsx` | Presentational canvas, skeleton, sizing classes |
| `useNodeThumbnailRender.ts` | Cache keys, invalidation, image preload, render scheduling, canvas drawing |
| `thumbnailQueue.ts` | Serialized thumbnail work queue |
| `renderSignature.ts` | Render-relevant dependency signatures |

This makes it possible to test and change render behavior without editing the
visual component.

## State ownership rules

| State kind | Examples | Where it belongs |
| --- | --- | --- |
| Document state | Layers, graph nodes, edges, export config | `CanvasDocument`, updated by editor document hooks |
| Render options | Primitive camera overrides, graph target | Passed as render options, not saved into layer fields |
| Editor state | Selection, expanded node, menus, gallery | Node canvas machine/hooks/context |
| Gesture draft | Drag position, wheel scale draft, active pointer | Component-local refs/state until commit |
| Cached derived work | Thumbnails, image preload, render signatures | Feature-local hooks or utility modules |

Do not write gesture draft state into `CanvasDocument` on every pointer move.
Commit once at the end of the gesture unless live document updates are a product
requirement.

## Rendering and browser-only code

- `renderDocument` and `renderGraphTarget` are the shared output path.
- PixiJS and Three.js code must remain browser-safe. Do not add server-only or
top-level browser-only imports to route render paths unless the project already
uses that pattern safely.
- Primitive scene details belong in `primitiveScene.ts`; live and offscreen
renderers should both consume that shared recipe.
- A preview shortcut is acceptable only when it is clearly UI-only. Example:
  primitive node cards use a live source viewport to show the object full-frame,
  while export still uses `renderGraphTarget` for final cover placement.

## Node canvas guidelines

1. Add node shell behavior to `NodeFrame`, not to every node type.
2. Add kind-specific preview behavior to a named preview surface.
3. Keep node data construction in `buildRFNodes.ts`.
4. Keep graph algorithms in `apps/web/app/utils/nodeGraph.ts`.
5. Keep inspector controls in `inspector` or shared `layer-controls`.
6. Keep transient interaction refs out of `CanvasDocument`.

## Performance guidelines

- Use content signatures for thumbnails. Do not key cache invalidation by object
  identity.
- Use `Map` and `Set` for repeated graph lookups.
- Keep expensive async work behind scheduling hooks or queues.
- Avoid broad barrel imports in feature internals when a direct import is clear.
- Prefer stable callbacks and refs for pointer/wheel listeners that fire often.
- Defer non-urgent renders when interaction responsiveness is more important
  than immediate visual sync.

## When to create a new file

Create a new component or hook when any of these are true:

- A component has two or more real interaction models.
- A file mixes rendering markup with async effects or cache logic.
- A branch has its own state lifecycle.
- A component is copied with small differences.
- A test would be clearer against a smaller helper or hook.

Do not create a shared abstraction just because two blocks look similar. Share
only when the same responsibility is present in both places.

## Review checklist

Before merging structural changes, check:

- Does each file have one primary reason to change?
- Are variants named by behavior instead of controlled by boolean prop piles?
- Is document state separate from editor and gesture state?
- Are browser-only renderers isolated from route-level server evaluation?
- Do thumbnails, gallery, preview, and export either share the renderer or
  document any intentional difference?
- Did the change pass `npm run typecheck`, `npm run lint`, `npm test`, and
  `npm run build` when relevant?
