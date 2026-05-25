# State Model

This document defines where state belongs in Artifact. The goal is predictable editing: a gesture should update the smallest possible state, commit deliberately, invalidate only what changed, and export the same image the user saw.

## Core rule

Each state value must have one owner.

If a value affects the final artwork, it belongs in `CanvasDocument` or in explicit render options passed beside the document. If a value only affects the current interaction, it must stay local to the editor until committed.

## State categories

| Category | Owner | Persisted | Undo history | Export impact | Thumbnail impact |
| --- | --- | --- | --- | --- | --- |
| Document state | `useGeneratorDocument` | Yes, localStorage | Yes | Yes | Yes |
| Graph state | `CanvasDocument.graph`, graph helpers | Yes, inside document | Yes | Yes | Yes |
| Export config | `CanvasDocument.export` | Yes | Yes | Yes | No, except export thumbnail |
| Selection and overlays | `nodeCanvasMachine`, route/component state | No | No | No | No |
| Text/image transform draft | `useLayerTransformDraft` | No, until commit | Commit only | After commit | After commit |
| Primitive camera state | `CanvasDocument.graph.primitiveViewStates` plus local draft state | Yes, inside graph metadata | Commit only | Yes | Yes for primitive/upstream thumbnails |
| Gallery media view state | `mediaViewStates` | No | No | No | No |
| Image assets/cache | `assetStore`, `useGeneratorAssets` | Asset payloads in IndexedDB; decoded cache is not | No | Yes, as render input | Yes when image loads |
| Imported font assets/cache | `fontStore`, shared Font Library picker, renderer font loading | Font payloads in IndexedDB; `FontFace` cache is not | No | Yes, as render input for text | Yes for text thumbnails/output |
| AI generation provenance/history | `ImageLayer.aiGeneration`, `ImageLayer.aiGenerationHistory` | Yes, lightweight prompt/job status and successful variant refs only | Yes when attached to a layer | Yes only through the selected `src` | UI status/history badge only until `src` changes |
| Local projects and recovery draft | `useProjects`, `projectStore` | Yes, IndexedDB | No | Only when loaded | Project thumbnail only |

## Durable document state

Durable document state is the creative artifact. It is serialized, persisted, shared, and rendered.

Current owner:

- `apps/web/app/hooks/useGeneratorDocument.ts`
- `apps/web/app/utils/documentCommands.ts` for pure document mutations
- `apps/web/app/utils/documentPersistence.ts` for normalization and initial document
  loading helpers
- `apps/web/app/hooks/useDocumentFileTransfer.ts` for browser-only `.artifact.json`
  import/export mechanics

Includes:

- `schemaVersion`
- `global` settings: background, seed, aspect
- `layers`
- `graph`
- `export`

Rules:

- Use layer factory functions when creating layers.
- Update documents immutably.
- Import external document JSON through normalization before committing it.
- Normalize unversioned documents to the current `DOCUMENT_SCHEMA_VERSION`.
- Do not mutate `doc` or layer objects in place.
- Do not store transient pointer/hover/drag state in the document.
- Do not write high-frequency pointer updates directly to the document unless there is no draft layer alternative.
- Procedural per-node variation belongs in source/repeat node `seedOffset`
  fields. The document seed remains the global scene seed.

## Graph state

Graph state describes composition. It is part of the document because it affects render output in node mode.

Owner:

- `CanvasDocument.graph`
- helpers in `apps/web/app/utils/nodeGraph.ts`

Rules:

- Graph positions, edges, merge nodes, color nodes, and repeat nodes are durable.
- Repeat nodes are graph-only utility nodes. They store serializable pattern,
  count, spacing, transform, opacity, and blend settings; they do not own DOM
  or renderer objects.
- Graph areas/groups are durable organization metadata. They are displayed as
  folders in the layer panel, but they still do not affect graph traversal or
  render order.
- Graph edits should be undoable.
- Graph traversal for preview/export must go through `renderGraphTarget`.
- Graph edits should not be hidden in UI-only state.

## Selection and overlay state

Selection and overlays are editor state. They do not affect output.

Owner:

- `apps/web/app/components/node-canvas/machine.ts`
- `NodeCanvas.tsx` while orchestration is still centralized

Includes:

- selected node ids
- selected edge id
- expanded node panel
- open context menu
- open gallery node

Rules:

- Selection changes must not dirty the document.
- Opening/closing menus must not invalidate thumbnails.
- Node-local controls should stop propagation when they are not intended to select, pan, or zoom the graph.

## Gesture draft state

Gesture drafts exist to keep interactions smooth. They represent "what the user is currently doing," not a committed document change.

Current examples:

- text/image node local transform draft
- active primitive drag ref

Rules:

- Pointer move and wheel ticks should update draft state first.
- Commit once on pointer-up, pointer-cancel, blur, or wheel idle.
- One continuous gesture should produce one undo snapshot.
- Draft changes should not trigger thumbnail renders.
- Draft UI should render live overlays or direct canvas/WebGL updates.

## Primitive camera state

Primitive camera state is a special case: it is not a layer parameter, but it does affect render output.

Owner today:

- `primitiveViewStates` in `NodeCanvas` while a primitive viewport is live
- `CanvasDocument.graph.primitiveViewStates` after committed camera changes
- passed to render/export through `RenderOptions.primitiveViewStates`

Fields:

- `rotationX`
- `rotationY`
- `zoom`
- `panX`
- `panY`
- `locked`

Rules:

- Do not duplicate camera rotation into `layer.tiltX` or `layer.tiltY`.
- Drag/wheel controls update primitive camera state.
- `layer.tiltZ` remains durable object spin.
- Camera lock is editor behavior but is stored with camera state so the viewport can behave consistently.
- Export must receive the same `primitiveViewStates` used by node/gallery preview.
- Primitive viewport state is serializable graph metadata; never store Three.js cameras, meshes, or renderer objects in the document.
- Draft camera movement may stay local during drag/wheel interaction, but the committed state must be persisted so saved projects and revisited pages keep the same framing.

## Render options

Render options are explicit inputs that affect rendering but are not necessarily part of the document.

Current type:

- `RenderOptions` in `apps/web/app/utils/renderer.ts`

Important fields:

- `graphMode`
- `draft`
- `skipEffects`
- `primitiveViewStates`

Rules:

- If an option changes pixels, it must be visible in call sites.
- Export must never use a hidden preview-only default.
- Draft options may trade fidelity for responsiveness only during active interaction.

## Undo rules

Undo should represent creative decisions, not implementation details.

Document commits use explicit update modes:

| Mode | Use |
| --- | --- |
| `snapshot` | Discrete creative actions such as add, delete, duplicate, randomize, or document import |
| `debounce` | Continuous edits such as sliders, graph node movement, and inspector field drags |
| `silent` | Internal normalization/bootstrap work that should persist but should not create undo history |

Expected behavior:

- A slider drag creates one undo entry.
- A text/image drag creates one undo entry.
- A wheel-scale gesture creates one undo entry after idle.
- Graph node movement creates one undo entry on drag stop.
- Selection, hover, menus, camera lock toggles, and gallery view changes do not need undo unless promoted to durable document features.

## Thumbnail invalidation rules

Thumbnails should rerender only when render-relevant state changes.

Should invalidate:

- document layer fields that affect pixels
- graph edges and upstream node changes
- image decode availability
- primitive camera state for affected primitive paths
- export aspect/size for export node thumbnail

Should not invalidate:

- hover
- selected state
- menu state
- local gesture draft before commit
- inspector open/closed state

## Image persistence decision

Artifact remains a browser-only editor for now. Imported image payloads are
stored in IndexedDB through `apps/web/app/utils/assetStore.ts`. Image layers keep a
serializable `src` string, but local imports are migrated from `data:image/...`
payloads to lightweight `artifact-asset://...` references.

Tradeoff:

- This keeps active localStorage documents small enough for real imported
  images.
- `.artifact.json` export and copy-link creation hydrate local asset references
  back to data URLs when possible so documents remain portable.
- Very large images can still make exported `.artifact.json` files or share URLs
  heavy after hydration.
- Local project snapshots and the pre-blank recovery draft are stored in
  IndexedDB via `apps/web/app/utils/projectStore.ts` so large document snapshots do not
  exhaust the small localStorage quota.
- Active quick-reload document state still uses localStorage through
  `documentPersistence`; it should contain asset references, not imported image
  payloads.
- Backend blob storage should be introduced only when there is a dedicated
  persistence layer and migration plan; decoded `HTMLImageElement` caches must
  still stay outside `CanvasDocument`.
- Generated AI image payloads should follow the same rule as imported images:
  the active document stores only a stable image `src` reference, while bytes,
  provider payloads, queue state, quota/cost accounting, and raw provider
  responses live in asset/server records outside `CanvasDocument`.
- The current v0.13 `AI Image` node is a normal image layer node. After a
  successful generation, the image layer may store serializable provenance in
  `aiGeneration` so the prompt stays tied to the resulting image. Successful
  variants may also be listed in `aiGenerationHistory` as `{ src, aiGeneration
  }` records, with `aiGenerationHistoryIndex` selecting which generated asset is
  active. The history stores references and prompts, not image bytes. Queued,
  running, error state, raw provider responses, quota, and costs still belong in
  API or UI/server state.
- If a future Image Generation node stores user-authored prompt/settings in the
  document, those fields must stay serializable and render-relevant. Transient
  queue state such as queued/running/progress/error details belongs in API or UI
  state, not in the saved document.

## Font persistence decision

Imported font payloads follow the same local-first shape as imported images, but
with a separate font store. Text layers keep a serializable `font` string. Bundled
fonts use their registry id, and imported fonts use lightweight
`artifact-font://...` references.

Rules:

- Font binaries live in IndexedDB through `apps/web/app/utils/fontStore.ts`.
- `CanvasDocument` should not keep `FontFace`, `ArrayBuffer`, `Blob`, file
  handles, or other live font objects.
- Active localStorage documents should contain only `artifact-font://...`
  references for imported fonts.
- `.artifact.json` export and copy-link creation may attach portable
  `fontAssets` records so another browser can hydrate the referenced imported
  fonts back into IndexedDB.
- Imported `.artifact.json` or `?doc=` payloads that contain `fontAssets` should
  store those assets locally and then strip the payload from the active
  document.
- Missing imported font payloads must fall back to a bundled stack instead of
  producing blank text.

## Do not do this

- Do not call document update APIs on every pointer move if a local draft can represent the interaction.
- Do not let React Flow global zoom receive events meant for node-local controls.
- Do not put preview-only state inside layer fields to make a bug disappear.
- Do not create a separate renderer for node preview unless it is explicitly draft-only and never used as truth.
- Do not add new effect or source parameters without updating factories, defaults, presets/randomization, controls, renderer, and tests.

## Preferred flow examples

### Text/image wheel scale

1. Wheel over selected text/image node.
2. Node intercepts wheel.
3. Draft scale updates live overlay.
4. Wheel idle commits `scaleX/scaleY` once.
5. Document updates.
6. Undo snapshot records one gesture.
7. Thumbnail invalidates once after commit.

### Primitive camera drag

1. Pointer down inside primitive viewport.
2. Viewport captures event before React Flow.
3. Drag updates WebGL view state directly.
4. Pointer up commits current primitive camera state.
5. Export receives the same camera state.
6. Layer `tiltX/tiltY` remain unchanged.

### Graph pan

1. User drags graph background, or drags over a locked primitive camera.
2. React Flow handles pan.
3. No document state changes.
4. No thumbnails invalidate.
