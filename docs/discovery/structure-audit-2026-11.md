# Structure Audit (2026-11)

Read-only audit of `development` at v0.52.0 (`38b88897`), run with the
[untangle-codebase](https://github.com/caldoai/skills/blob/main/skills/untangle-codebase/SKILL.md)
method: for every piece, ask "should these pieces change together?" and
record hidden links, needless links, surplus, and special cases. Steps 1-3 of
the method only (list, redesign). Nothing was changed. This is input for
version plans, not scope; see `docs/version-planning.md`.

Five auditors covered document state, rendering, node canvas, editor shell, and
API/packages. Each finding has a file and line; the high-leverage ones were
re-checked by hand. Paths are relative to `apps/web/app/` unless they start
with `apps/` or `packages/`.

## How to read this

Each top-level bullet is one fix. The indented bullets are the problems it
removes. Cross-cutting fixes come first: one change there removes problems in
several areas. Area fixes follow. Leverage is **H**, **M**, or **L**.

Things the auditors checked and found sound are listed at the end. Do not
refactor them.

## Cross-cutting fixes

- **H. Material and shader kinds own their port rules.** Add `outputs`,
  port labels, `canAccept(source)`, and a "material input" resolver to
  `GraphNodeKindModel`, plus one `object3DSidePorts(layer)` helper in
  `utils/nodeGraph.ts`. Renderer, previews, insertion, validation, and the
  layer tree call those. This is the largest remaining node-kind switch
  outside kind modules (AGENTS.md forbids it; `nodeKindLocality.test.ts` does
  not catch these because they compare strings, not switch on `kind`).
  - `utils/render/graph.ts:118-122` looks up `'material'`/`'shader'` by kind.
  - `utils/render/scene3dLayer.ts:34-37` repeats the same lookup.
  - `utils/render/nodeKinds/context.ts:74-75` shader special case at a fixed 512x512.
  - `utils/render/graphInputs.ts:6-9,109-114` comment admits the tables restate renderers by hand.
  - `components/node-canvas/graphInsertion.ts:66-84` if-chain over merge/color/mask/shader/material restates each model's `insertion()`.
  - `components/node-canvas/hooks/useNodeGraphEvents.ts:124-141` material/shader connection rules live in a hook.
  - `components/node-canvas/nodeKinds/{merge,mask,repeat,color}.tsx` port ids written twice per file and again in the model.
  - `components/node-canvas/nodeKinds/inspectors.tsx:52` and `useNodeGraphEvents.ts:135` both check `toPort === 'bg'`.
  - "Which side ports does a 3D Object take" written four times: `nodes/NodeTypes.tsx:80-84`, `graphInsertion.ts:159-162`, `useNodeGraphEvents.ts:136-137`, `utils/documentCommands.ts:161-165`.
  - `shaderMaterialConfig` written four times: `NodeCanvas.tsx:1230`, `thumbnails/PrimitivePreviewSurface.tsx:165`, `thumbnails/Scene3DPreviewSurface.tsx:177`, `utils/render/nodeKinds/context.ts:56`.
  - `thumbnails/materialTextureCanvases.ts:68-76` re-implements `resolveMaterialTextureCanvases` with its own signature (preview/export parity risk, invariants 5-6).
  - `utils/documentSourceMapping.ts:46`, `utils/graphLayerTree.ts:99`, `utils/documentAssets.ts:79` more `'material'` checks outside the kind.
  - `utils/documentCommands.ts:470-478` shader-specific naming in `nodeForAddAction`.

- **H. A layer-kind registry, like `GRAPH_NODE_MODELS`.** One
  `LAYER_KINDS` record per layer kind: symbol, label, family, summary,
  signature fields (or excludes), source layout, visible-content test,
  Controls component. Editor, Add Library, docs routes, signatures, and the
  renderer iterate it.
  - `components/layers-panel/layerDisplayItems.ts:8` kind symbols drifted: image `◻`/fill `■` here, `◧`/`◼` in `add-library/addLibraryModel.ts:282`, `node-canvas/constants.ts:26`, `routes/docs.nodes.tsx:85,100,176`.
  - `routes/docs.reference.tsx:35` source list omits `model`.
  - `layer-controls/LayerControls.tsx:120` `SOURCE_LAYER_KINDS` repeats `SOURCE_TYPES` (`types/config.ts:39`); `addLibraryModel.ts:52` another list.
  - `LayerControls.tsx:316,784,1314-1331,1419,1493,1505` six different kind dispatches with casts.
  - `utils/renderSignature.ts:23-112` hand-kept include lists per layer kind; header asks authors to keep them in sync (invariant 6 risk).
  - `utils/render/graph.ts:105-113` and `utils/render/layers/index.ts:272-290` full-frame layout decided twice, plus per-kind ternaries into an 11-parameter `drawSourceLayer`; the `'document'` layout branches (`utils/proceduralSource.ts:315,345-413`) are dead.
  - `hooks/documentRenderPolicy.ts:147` `hasVisibleContentLayer` switches on layer kind.

- **H. One "replace the workspace" command.** A single
  `replaceWorkspace(doc, reason)` (command plus route hook) that normalizes,
  bumps `documentSessionId`, clears selection, closes panels, and resets view
  state and primitive cameras. Today each path does a different subset.
  - `hooks/useEditorDocument.ts:162-171` `replaceDocument`; `:340-345` `handleRandomize` skips session bump and normalize; `:347-362` `handleNewBlank` a third mix.
  - `routes/editor.tsx:344-351,408-427,466-485` four more subsets; load-project (`:448`) and randomize (`:434`) skip view and camera reset.

- **M. Move render-facing types and constants out of `components/`.** The
  only upward imports in the web app (import graph checked by script).
  - `utils/primitiveScene.ts:15,459,465` scene light colors come from `NODE_CANVAS_COLORS` in `components/node-canvas/constants`: a UI palette edit changes golden renders.
  - `components/PrimitiveViewportState.ts` is a pure type imported by five renderer files (`utils/render/layers/index.ts:2`, `utils/proceduralSource.ts:1`, `utils/modelRenderer.ts:3`, `utils/primitiveRenderer.ts:2`, `utils/primitiveScene.ts:16`), and duplicates `PrimitiveViewportStateConfig` (`types/config.ts:356-363`) field for field.
  - `hooks/useEditorDocument.ts:2` takes `InsertConnectionConfig` from `components/node-canvas`; `utils/documentCommands.ts:66` declares the same type.
  - `hooks/useDocumentFileTransfer.ts:2` takes a type from `components/editor-workflow/EditorConfirmDialog`.

- **M. One shared inspector field kit in `components/inspector-system/`.**
  `layer-controls/` and `node-canvas/inspector/` import each other today.
  Give it explicit `DenseInspectorSection`/`OrdinaryInspectorSection`
  variants and drop the `detached` boolean.
  - `layer-controls/{LayerControls,LayerStateSection,PresetStartSelect,LayerTargetInspector}.tsx` import `node-canvas/inspector/*`; `node-canvas/inspector/{EffectInspector,RepeatInspector,fields/BlendModeNote}.tsx` import `layer-controls/fieldDefs`.
  - `EffectInspector` and `Scene3DInspector` live in node-canvas but only `LayerControls` uses them.
  - `detached` is always passed (`LayerTargetInspector.tsx:49`, `nodeKinds/inspectors.tsx:31-54`), so its false branch is dead in seven components, and its meaning is inverted (true drops the `-detached` class).
  - `components/Sidebar.tsx:50` and `node-canvas/inspector/fields/InspectorSection.tsx:6` two private wrappers over `inspector-system/InspectorSection`.
  - `routes/docs.nodes.tsx:5` docs route imports blend data from a component folder.

- **M. UI edits go through named commands, not whole graphs.** Give
  NodeCanvas a `dispatch(DocumentCommand)` prop as Sidebar has, and replace
  `onGraphEdit(nextGraph)` with commands.
  - `node-canvas/hooks/useNodeAreaActions.ts:85-101` copies `createGraphAreaInDocument` (`utils/documentCommands.ts:284-297`); Layers uses `createArea`/`removeArea` commands, Nodes does not.
  - `node-canvas/hooks/useNodeGraphEvents.ts:58-63` builds edge ids with `Date.now()` instead of `createGraphEdge` (`utils/nodeGraph.ts:105`).
  - `node-canvas/types.ts:53-68` eight callbacks that each wrap one dispatch; 12 `onGraphEdit(` sites compute the next graph in the UI.
  - `layers-panel/LayerAddMenu.tsx:78-101` splits `AddAction` into six callbacks threaded through `Sidebar.tsx:80-142` (ten wrappers around `onDocCommand`) for one consumer.

## Area fixes

### Rendering

- **H. One render-cache constructor.** `renderCacheFor(doc, options, ...)`
  builds the namespace from `RenderOptions` plus `getRenderAssetEpoch()` and
  content-addresses entries, as `utils/graphNodeRenderCache.ts:43-108` already does.
  - `utils/layerPreviewRenderCache.ts:35-52` namespace has no asset epoch, so a frame drawn with a fallback font/model/env can be reused after the asset arrives (verified: no epoch import).
  - `utils/generateThumbnail.ts:14,45-58` module cache keyed by document JSON, no epoch; private copy of `imageCacheSignature`.
  - `components/NodeGalleryCanvas.tsx:46-57` hand-built session key, no epoch.
  - `utils/render/graph.ts:275` without `entryKey` the key is the bare node id; thumbnails and gallery rely on caller namespaces.
  - `components/CanvasPreview.tsx:151` re-implements `viewStateRenderSig` (`utils/renderSignature.ts:122`).
  - "find missing upstream images, preload" written three times: `NodeGalleryCanvas.tsx:66`, `thumbnails/useNodeThumbnailRender.ts:175`, `routes/docs.nodes.tsx:873`.

- **H. One kernel registry drives both passes.** Each kernel's Canvas
  `apply` and GPU `buildFilter` sit beside its `KERNELS` entry; both runners
  iterate `KERNEL_PASS_ORDER` gated by `isKernelActive`.
  - `utils/render/layers/canvasEffects.ts:309-441` hand-written pass order and activations.
  - `utils/pixiFilters.ts:433-506` third copy of the order; `:448-454` repeats `activation: 'nonzero'`. `:512` pass-through alias.
  - `types/effectKernels.test.ts:83` checks only that the order lists every kernel, not that runners follow it.

- **H. Settle `effectResolution` and export scale.** Effects already render
  at full size when `effectResolution` equals W x H, but passing it still
  disables GPU chaining (`utils/render/graph.ts:96`). So export, thumbnails,
  and gallery run per-layer GPU passes while preview chains them: a
  preview/export path split.
  - `utils/exportCanvas.ts:36-41` export renders at base size and nearest-neighbour upscales for 2x/3x (verified). `docs/rendering.md:524,526` describe the opposite.
  - Callers whose option is a no-op: `exportCanvas.ts:38`, `generateThumbnail.ts:78`, `NodeGalleryCanvas.tsx:111,121`.

- **M. Derive effect help from `KERNELS`.**
  - `utils/effectInfo.ts:606-616` `EFFECT_THUMB_KEY_ALIASES` equals "first `amounts` entry of the kernel" for all nine.
  - `utils/effectInfo.ts:73,320,327,334` `EFFECT_META.family` values are dead (kernel family wins).
  - `types/effectPresets.ts:155-160` `primary` equals the kernel's first amount for 62 of 70 presets.
  - `utils/effectInfo.ts:13,622-639` help-copy module imports the renderer, so inspectors pull in the render graph.
  - `components/add-library/addLibraryModel.ts:139,490` two more copies of effect descriptions, drifted from `utils/effectDocs.ts:48`.

- **M. Label and report draft-only fallbacks.**
  - `hooks/documentRenderPolicy.ts:147-196` luminance heuristic treats dark covers as blank; `hooks/documentRenderCycle.ts:356` then forces a draft for a magic 5000 ms. Not in `docs/rendering.md` (invariant 5).
  - `utils/gpuRender.ts:394-402` with no GPU context, export returns the input unchanged: GPU effects silently drop from the file.
  - `utils/gpuRender.ts:349` `setTimeout(0)` before a synchronous extract.

### Document state and assets

- **H. Kind models list their asset sources.** Add `assetSources(node)` and
  `mapAssetSources(node, fn)` to the kind models and one document walker on
  top. Inventory, cloud upload, packaging, and remapping read one list.
  - `utils/documentAssets.ts:66-89`, `utils/cloudProjectAssets.ts:260-273`, `utils/documentPackage.ts:128-132` three walks; the package one skips material textures, so `remainingLocalRefs` (`:420`) disagrees with the inventory (verified).
  - `utils/fontStore.ts:290` and `documentAssets.ts:103` two more font walks.
  - `utils/cloudProjectAssets.ts:248-257` private copies of `isModelDataUrl`/`isEnvironmentDataUrl`.

- **M. One portable-asset table.** `{ uriPrefix, isDataUrl, normalize, store, hydrate, strip }`
  per kind (font, model, environment, image).
  - `utils/documentPersistence.ts:117-203` same normalizer three times.
  - `utils/documentAssets.ts:134-188` four kinds listed by hand in three functions.
  - `utils/{assetStore,envAssetStore,fontStore,modelAssetStore}.ts` same prefix/uri helpers four times.

- **H. One recovery-draft module.** Own `startsBlank(search)` and return the
  pending draft as a value, not a module global.
  - `utils/documentPersistence.ts:57,373-377,460-473` module global `pendingPreBlankDraft` that `hooks/useEditorDocument.ts:114-121` must take later: a call order callers must know.
  - Blank check parsed three times and drifted: `documentPersistence.ts:429,463` vs `useEditorDocument.ts:85`, so `?new=1` sets `fromBlankParam` but does not start blank (verified).
  - Draft parse twice (`documentPersistence.ts:378-393`, `projectStore.ts:129-145`); save sequence twice (`useEditorDocument.ts:347-355,364-369`).

- **M. Project persistence lives in `utils/`.**
  - `hooks/useProjects.ts:43-50` copies `projectStore.ts:52-59`; `:330-370` pure merge logic inside a hook.
  - `utils/projectLibrary.ts:17,74-127` `persistSavedProjects` and helpers dead outside tests (verified).

### Editor shell

- **H. Split `routes/editor.tsx` and finish `useEditorAssets`.**
  - `routes/editor.tsx:48-49,239-299` copy byte limits, checks, and errors from `hooks/useEditorAssets.ts:9-10,149-176`.
  - `routes/editor.tsx:368-376,591-597` drop routing written twice.
  - `routes/editor.tsx:400-405` focuses the AI prompt with `setTimeout` plus a global `querySelector` into `AiGenerationPanel.tsx:835`.
  - Clusters: 142-216 view state hook; 217-303 file intake; 391-527 workspace transitions (see cross-cutting fix); 750-849 import confirm component.

- **H. `AiGenerationPanel` uses the access hook.**
  - `components/AiGenerationPanel.tsx:1024-1155` re-implements `features/ai-access/useAiGenerationAccess.ts:14`.
  - `:55` and `useAiGenerationAccess.ts:63` duplicated dev-token reader, including an `as unknown` cast (invariant 13).
  - `:139,1569` and `useAiGenerationAccess.ts:31,82` duplicated bearer fetch and 8 s timeout.
  - `:270-298` provenance block copied into `layer-controls/LayerControls.tsx:326-356`, where it never renders; `LayerControls.tsx:610` `ImageGenerationProvenance` is dead.
  - Clusters: 149-240 debug; 300-633 diagnostics and history; 1156-1479 polling, import, submit as a `useAiGenerationJob` hook; 1520-1771 view.

- **M. Split `NodeCanvas.tsx` (1500 lines).** File drop 113-125/442-488; shortcuts 490-524/1482-1500;
  menus 782-1047; gallery 1049-1293; toolbar 1295-1427 (account sign-in UI at 1410-1427 does not belong
  in the node editor); edge decoration 1429-1480. Shader generation status (204-219) runs through the
  generic build context for one kind; move it to the shader kind.

- **L. Dead or constant props.** `NodeCanvas.tsx:203` `primitiveRenderModes` is always `{}`;
  `onImageFileDrop` branch (`NodeCanvas.tsx:486`) never runs because the only caller also passes
  `onFilesDrop`; `modeSwitcher` threaded through `Sidebar.tsx:29,323` but never passed;
  `GraphNodeInspectorProps.doc`/`onUpdateGraphNode` read by no inspector.

- **M. Merge the two transform draft hooks.** `nodes/useLayerTransformDraft.ts` and
  `nodes/useTransformNodeDraft.ts` duplicate timers and settle logic; the duplication is suppressed with
  `fallow-ignore`.

### API and packages

- **H. One contract module per API feature in `packages/shared`.**
  - `apps/web/app/utils/aiGenerationClient.ts:289-435` hardcodes every path although `AI_API_PATHS` exists; `apps/api/src/routes/ai.ts:73,95` and `routes/admin.ts:30,77-80` re-spell shared paths.
  - `CloudProjectResponse` and `ProjectAssetResponse` defined in both API and web.
  - `artifact-cloud-asset://` and the asset kind set written four times, including SQL in `apps/api/src/cleanup.ts:168,207`.
  - `AI_SHADER_REQUEST_MODES` unused while the union is re-spelled in four files; `AiGenerationJobStatus` shadowed in `apps/api/src/db/types.ts:18`; alias block with zero-use names (`packages/shared/src/index.ts:804-813`).
  - `apps/api/src/contracts.ts` pure re-export barrel.

- **H. One account gate and one body reader at the router.**
  - resolveAuth, upsert, disabled check copied in six places with different messages; get and cancel (`routes/ai.ts:1102,1116`) skip it.
  - `routes/ai.ts:133-138` and three other wrappers map errors to `invalid_json`; only some handle 413.

- **H. Shader request mode as a policy object.** `mode === 'openai'` branches in
  `apps/api/src/routes/ai.ts` (8 sites) and `apps/api/src/shaderWorker.ts` (5 sites) must agree;
  hardcoded `?? 'gpt-5.5'` fallbacks beside the provider.

- **M. Provider adapters own models and pricing.** Default model names in four files; mock
  detection by name suffix (`providerPricing.ts:57`); pricing used as validation via try/catch.

- **M. Repository transitions return `{ applied: false }`.** Bare `catch {}` in `routes/ai.ts:427,497,573`
  treats a DB outage as a race. `db/memory.ts` (1283 lines) re-implements quota rules, and the only
  real-Postgres suite is skipped without a DB.

- **M. Remove `s3` until it exists.** `apps/api/src/config.ts:96` accepts it, `runtime.ts:65` always
  builds `LocalAssetStorage` (verified). CLIs read `process.env` directly.

- **M. One client fetch module for web and backoffice.** Token key and production base URL defined in
  both apps; four `requestJson` copies with their own error classes.

## Special cases left

Counted as the method's progress measure. After the fixes above, the ones
that should remain are only those the product needs (best-effort storage
catches commented as such).

| Kind                                    | Examples                                                                                                                                                    | Removed by                                             |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Kind string checks outside kind modules | ~15 sites (material, shader, `bg`)                                                                                                                          | Material/shader port rules                             |
| Layer-kind branches                     | ~12 sites                                                                                                                                                   | Layer-kind registry                                    |
| Timing hacks                            | `setTimeout`/rAF in `editor.tsx:400`, `gpuRender.ts:349`, `useNodeContextMenus.ts:442`, `EdgeContextMenu.tsx:36`, `useNodeGraphEvents.ts:92`, 5000 ms draft | Workspace command, menu machine, labelled draft policy |
| Swallowed errors                        | `parseDocumentJson`, `routes/ai.ts` 4 sites, `docs.nodes.tsx:909`, `home.tsx:194,363`, `cloudProjectAssets.ts:206`                                          | Typed results, router body reader                      |
| Skipped tests                           | `accountTierPostgresIntegration.test.ts:12` without DB                                                                                                      | Repository contract suite                              |

## Doc drift found

- `AGENTS.md` names `EFFECT_PARAMS` in `types/effectSchema.ts`; it does not
  exist. Parameters live in `KERNEL_PARAMS` (`types/effectKernels.ts`), as
  `docs/effect-development.md` says.
- `docs/rendering.md:524,526` on export resolution and GPU chaining (see
  rendering fix).

## Looked fine (do not refactor)

- Node-kind registries: `GRAPH_NODE_MODELS`, `GRAPH_NODE_RENDERERS` (typed
  mapped, missing kind fails to compile), `GRAPH_NODE_UIS`,
  `GRAPH_NODE_INSPECTORS`.
- `utils/migrations/`: one file and fixture per step; `normalizeDocument` has
  no legacy branches.
- `utils/documentDispatch.ts` command table with history policies, and the
  pure `documentHistoryReducer`.
- `utils/graphNodeRenderCache.ts`: the right cache model to generalise.
- `utils/render/graphInputs.ts:147` single reachability walk;
  `utils/effectStack.ts` run split; `utils/gpuRender.ts:46-112` shared Pixi
  queue; `utils/render/workers/workerClient.ts`.
- Effect inspector controls come from `effectSpec(...)`; thumbnails render
  through `renderGraphTarget`; `machine.ts` holds canvas UI state.
- `layer-controls/LayerTargetInspector.tsx` shared by Layers and Nodes; no UI
  outside the route calls `setDocument`.
- `packages/ui` and `packages/shared` import no app code; image
  `ProviderRegistry` has three real adapters; `apps/api/src/http.ts` CORS.

## Suggested order

Each step is independent and lands with tests and unchanged golden fixtures.

1. Cheap correctness: asset epoch in preview, thumbnail, and gallery caches;
   `?new=1` blank parse; package walker material textures; AGENTS.md
   `EFFECT_PARAMS` line. Done with this audit: one `startsBlankDocument`, the
   package manifest reads `inspectDocumentDependencies`, and the three caches
   key on the asset epoch.
2. Render-facing types and light colors out of `components/` (no pixel
   change if colors keep their values).
3. Material/shader port rules into kind models.
4. Layer-kind registry.
5. Workspace replace command, then `editor.tsx` and `AiGenerationPanel` splits
   (fits the Editor Polish plan).
6. Inspector field kit and NodeCanvas commands.
7. API contracts and router gate.
8. Kernel registry and `effectResolution` (needs an owner decision: export
   scale changes pixels).
