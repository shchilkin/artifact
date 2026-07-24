# Artifact Inspector System Inventory

Status: implemented runtime migration contract for v0.46.

This inventory closes the property-editing boundary for
[v0.46 Artifact Inspector System](version-plans/v0.46.md). It assigns every
current Artifact inspector surface to one migration issue or to an explicit
non-goal. The source-owned patterns established with this inventory are live in
`/docs/style-guide`. Production inspector implementations now consume them
directly or through thin compatibility adapters; legacy selectors remain only
as the bounded v0.48 removal seam.

The migration changes anatomy, field association, visible state, validation
feedback, density, focus, and responsive layout. It must not change document
defaults, graph rules, history grouping, serialization, renderer inputs,
camera ownership, provider policy, or accepted AI results.

## Assignment Rules

- **#169** owns layer-backed property forms, including common layer guardrails,
  source replacement, AI Image properties, and the text, image, emoji, fill,
  primitive/model, noise, and array families.
- **#168** owns the properties-panel selection shell and ordinary graph utility
  forms: color, merge, repeat, mask, transform, environment, output/export,
  ports, and their empty or disconnected states.
- **#170** owns effect-family controls, grime shadow, materials, and 3D scene
  property editing.
- **#171** owns preset, Code Shader, and AI Shader authoring, generated property
  manifests, validation, provider-access feedback, and accepted-result status.
- The v0.45 target header, rails, and editor workflow patterns remain their
  hosts. Inspector migrations consume that anatomy rather than replacing it.
- The v0.47 canvas-chrome release owns direct-manipulation handles, node
  housings, previews, galleries, and primitive camera controls.
- Compatibility selectors and the legacy `node-inspector-*` and
  `sidebar-section*` implementations remain until the v0.48 conformance gate.

## Closed Surface Inventory

### Layer property surfaces — #169

| Visible surface | Current implementation | Required states |
| --- | --- | --- |
| Selected-layer basics | `Sidebar.tsx` `SelectedLayerBasics` | visible, hidden, locked guardrail |
| Image source | `Sidebar.tsx` `ImageSourceSection` | empty, ready preview, replace, file input, drag/drop, missing local asset |
| Emoji set | `Sidebar.tsx` `EmojiSetSection` | selected/unselected glyphs, keyboard focus, wrapped dense grid |
| AI Image properties | `Sidebar.tsx` `AiImageSection`, `AiGenerationPanel` | access disabled, empty, prompt/provider fields, loading, success, error, recovery |
| Shared layer controls | `layer-controls/LayerControls.tsx` | ordinary/dense, detached Layers host, embedded Nodes host, disabled, locked, existing live-edit callbacks |
| Text properties | `LayerControls`, `FontPicker` | content, font ready/missing/importing/error, color, placement, style |
| Image properties | `LayerControls` | fit, placement, scale lock, rotation, opacity, blend |
| Emoji properties | `LayerControls` | glyph input, density, size, placement, variation |
| Fill properties | `LayerControls` | color, opacity, blend |
| Primitive and model-source properties | `LayerControls` | shape/model metadata, unavailable source, replace source, material-adjacent readouts |
| Noise and array properties | `LayerControls` | preset-specific fields, value overrides, seeded variation, disabled/inactive controls |
| Layer-backed node host | `node-canvas/inspector/LayerInspector.tsx` | same fields and state as Layers without forking document commands |

Effect-layer controls are assigned to #170 even though `LayerControls` currently
hosts them. The common host may migrate in #169, but effect metadata and authored
values remain owned by #170.

The effect-only **Use source alpha** toggle is an explicit exception to the
`SelectedLayerBasics` host assignment: #170 owns its migration because it writes
the authored `EffectLayer.maskAlpha` value. #169 may migrate the surrounding
visibility and lock rows, but must leave that toggle on the legacy surface until
#170 moves it.

### Ordinary graph property surfaces — #168

| Visible surface | Current implementation | Required states |
| --- | --- | --- |
| Properties-panel selection content | `node-canvas/panel/NodePropertiesPanel.tsx` | no selection, selected target, close, narrow drawer, keyboard focus |
| Target overview and layer lock readout | `NodePropertiesPanel.tsx` | layer-backed, graph utility, output, hidden, locked |
| Connected-port rows | `node-canvas/inspector/PortRow.tsx` and material/environment input rows | accessible connected/disconnected status; unavailable/read-only resource metadata |
| Color utility | `ColorInspector.tsx` | named target, ordinary numeric fields |
| Merge utility | `MergeInspector.tsx` | blend, opacity, missing input |
| Repeat utility | `RepeatInspector.tsx` | pattern variants, dense transforms, optional backdrop |
| Mask utility | `MaskInspector.tsx` | alpha/luma modes, invert, threshold/softness, missing input |
| Transform utility | `TransformInspector.tsx` | linked/unlinked scale, placement, rotation, opacity, blend |
| Environment resource | `EnvironmentInspector.tsx` | empty, ready, unavailable, replace, preview loading/failure |
| Output/export target | `ExportInspector.tsx` | aspect, format, scale, target, export ready/busy/disabled/error |

Graph mutation helpers, connected-port resolution, cycle prevention, and
locked-node deletion rules remain authoritative; the inspector pattern does
not reproduce them.

### Effect, material, and scene surfaces — #170

| Visible surface | Current implementation | Required states |
| --- | --- | --- |
| Effect alpha-mask toggle | `Sidebar.tsx` `SelectedLayerBasics` | enabled/disabled source-alpha masking for an effect layer |
| Effect layer and effect-node controls | `EffectInspector.tsx`, `EffectControlSections.tsx`, effect branches in `LayerControls` | every metadata-defined field, inactive/disabled, error, dense section, info note |
| Grime shadow effect utility | `GrimeShadowInspector.tsx` | source missing/ready, color and dense numeric controls |
| Material properties | `MaterialInspector.tsx` | scalar/color values, texture ports, connected/missing maps, clear action |
| Scene inputs in Layers | `Sidebar.tsx` `SelectedScene3DInputSettings` | source/environment connected or missing, read-only metadata |
| 3D scene properties | `Scene3DInspector.tsx` | model/material/environment inputs, lighting, scene composition, preset state |

Primitive camera rotate, pan, zoom, lock, and reset remain v0.47 canvas chrome.
They are not inspector fields and must not be recreated in #170.

### Shader authoring surfaces — #171

| Visible surface | Current implementation | Required states |
| --- | --- | --- |
| Shader role and authoring method | `ShaderInspector.tsx` | fill/effect, input missing/ready, preset/code/AI method |
| Preset Shader controls | `PresetShaderInspector.tsx`, `ShaderCompositeSection.tsx` | preset variants, palette, density, strength, variation, effect-only composition |
| Code Shader authoring | `CodeShaderInspector.tsx` | empty/code, dirty, invalid, accepted, manifest controls |
| AI Shader prompt/refinement | `AiShaderInspector.tsx`, `AiShaderInspectorSections.tsx` | account disabled, empty, creating, checking, repairing, refining, fallback, failure |
| Generated shader fields | `ShaderPropertyControl.tsx` | number, boolean, color, manifest constraints, disabled |
| Shader validation and result status | `ShaderStatusMessage.tsx`, AI Shader status sections | loading, warning, failure, accepted, provider/fallback provenance |

Provider access, request cancellation, one-repair policy, browser validation,
refinement ancestry, and accepted-result commits remain in the existing
controllers and machines. #171 is a visual and accessibility migration only.

## Approved Non-Goals

| Surface | Assignment |
| --- | --- |
| Inspector target header and desktop/mobile rail placement | Already owned by v0.45; consumed unchanged |
| Add Library search, filters, preview, and insertion | v0.45 editor workflow, not property editing |
| Layer rows, area folders, command bars, menus, and workflow notices | v0.45 editor workflow |
| Canvas handles, node frames, graph viewport, thumbnails, galleries, and 3D viewport controls | v0.47 canvas chrome |
| New Chat mode, Context Assistant, Change Preview, and scoped assistants | v0.49 AI-assisted creation |
| Public navigation, Projects library, Docs forms, route recovery, and account surfaces | v0.44 product surfaces |
| Backoffice account, policy, usage, and mutation forms | v0.43 Backoffice UI System |
| UI Foundation field anatomy | v0.42; the Artifact inspector composes it rather than forking it |

No current property surface may be placed into an unassigned legacy bucket. A
new surface discovered during migration must be added to one table above before
the owning issue can close.

## Source-Owned Pattern Contract

The product-owned patterns live in
`apps/web/app/components/inspector-system/*`. They own visible anatomy and
accessible state exposure, not domain state or mutations.

### `InspectorSection`

- Owns a labelled disclosure trigger, `aria-expanded`, body association,
  ordinary/dense spacing, focus-visible treatment, and disabled/loading
  presentation.
- Accepts controlled `open` and `onToggle`; the caller keeps expansion state.
- `loading` exposes `aria-busy` but does not invent progress or disable edits.

### `InspectorField`

- Composes UI Foundation `Field` with its associated native control.
- Exposes `dirty`, `disabled`, `locked`, `loading`, and
  `idle | validating | valid | invalid` validation states through stable data
  attributes.
- Keeps label, hint, error, `aria-describedby`, `aria-errormessage`, and
  `aria-invalid` association in the Foundation seam.
- Propagates `disabled` and invalid validation state to the supplied control.
  `locked` never disables a property by itself because Artifact's layer lock
  protects deletion and reorder, not property editing.

### `PropertyRow`

- Owns compact label/value/control alignment for sliders, toggles, color
  inputs, readouts, and other dense properties that do not fit a stacked field.
- Associates its label, hint, status, and error with the supplied control.
- Stacks to one column at narrow widths and preserves DOM order for keyboard
  navigation.
- Mirrors the same explicit state vocabulary as `InspectorField`.

### `InspectorStatus`

- Composes UI Foundation `InlineNotice` and `ProgressIndicator`.
- Uses information, success, warning, or danger semantics; danger remains an
  alert and other tones remain polite status updates.
- Announces real loading without fake percentages. Provider- or
  workflow-specific recovery actions remain caller-owned.

## State Ownership And Compatibility

- `dirty`, `loading`, and validation are inputs from the owning workflow. The
  patterns do not compare documents, start validation, call providers, or
  commit data.
- Current layer fields commit through their existing callbacks immediately, so
  `LayerControls` does not fabricate a dirty state after a committed change. It
  accepts an authoritative `dirty` input for a future owning workflow.
- Code Shader validation is synchronous in the browser and therefore moves
  directly between idle, invalid, and accepted. The real validating state is
  exercised by the asynchronous AI Shader workflow and deterministic
  specimens; the inspector does not add a fake delay.
- `PortRow` exposes existing connected/disconnected resolution to assistive
  technology without changing node housing or inventing port availability.
  Read-only and unavailable resource state remains in material/environment
  inspector rows; visible node-port grammar stays assigned to v0.47.
- Live gestures and committed changes keep their current callback and history
  modes. The patterns contain no document, graph, renderer, camera, export, or
  provider imports.
- Stable state attributes are a browser-test and styling seam, not serialized
  document fields.
- Source-owned patterns and compatibility selectors coexist until v0.48
  removes the legacy CSS seam. Runtime fields no longer fork label, validation,
  disclosure, or status anatomy.

## Deterministic Specimens

`InspectorPatternSpecimens` mounts two live layouts on `/docs/style-guide`:

- **Ordinary**: stacked text/select fields with hint, dirty, valid, invalid,
  disabled, and saved status examples.
- **Dense**: property rows with precise values, validating, locked-but-editable,
  disabled, loading, and responsive states.

The specimens use only local static values. They do not read persisted
documents, create history, call a renderer, move a camera, contact a provider,
or require an account.

## Acceptance-Test Seams

- Component tests assert label/error association and the stable state contract
  through rendered public markup.
- Focused style-guide browser coverage asserts ordinary/dense specimens,
  keyboard focus, disclosure behavior, disabled, locked, dirty, loading,
  validation, and 390-pixel horizontal containment.
- Existing document, graph, render, camera, provider, and browser suites remain
  the compatibility proof for later migration issues.
